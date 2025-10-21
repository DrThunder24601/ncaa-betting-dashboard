'use client';

import { useState, useEffect } from 'react';

interface BettingOpportunity {
  matchup: string;
  favorite: string;
  underdog: string;
  ourLine: number;
  vegasLine: number;
  edge: number;
  betRecommendation: string;
  confidence: string;
  edgeBand: string;
}

interface PerformanceMetrics {
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  currentWeekOpportunities: number;
}

interface SystemNotification {
  timestamp: string;
  subject: string;
  body: string;
  type: string;
}

export default function BettingDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<BettingOpportunity[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetrics>({
    totalBets: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    currentWeekOpportunities: 0
  });
  const [notification, setNotification] = useState<SystemNotification | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isRealTime, setIsRealTime] = useState(false);

  useEffect(() => {
    fetchBettingData();
    
    // Set up real-time polling every 30 seconds
    const interval = setInterval(fetchBettingData, 30000);
    
    // Check for notifications every 10 seconds
    const notificationInterval = setInterval(checkNotifications, 10000);
    
    return () => {
      clearInterval(interval);
      clearInterval(notificationInterval);
    };
  }, []);

  const fetchBettingData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/predictions');
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Handle both API server format and direct Google Sheets format
      const predictions = data.data?.predictions || data.predictions || [];
      const coverAnalysis = data.data?.cover_analysis || data.coverAnalysis || [];
      const lastUpdated = data.data?.generated_at || data.lastUpdated || new Date().toISOString();
      const realTime = data.data ? true : (data.realTime || false);
      
      // Process predictions into betting opportunities
      const bettingOpps = processPredictions(predictions);
      setOpportunities(bettingOpps);
      
      // Calculate performance metrics
      const metrics = calculatePerformance(coverAnalysis, bettingOpps.length);
      setPerformance(metrics);
      
      // Update real-time status
      setLastUpdated(lastUpdated);
      setIsRealTime(realTime);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
      console.error('API Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.hasNotification) {
          setNotification(data.notification);
        }
      }
    } catch (err) {
      // Silently fail - notifications are not critical
      console.log('Notification check failed:', err);
    }
  };

  const dismissNotification = async () => {
    try {
      await fetch('/api/notifications', { method: 'DELETE' });
      setNotification(null);
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
    }
  };

  const processPredictions = (predictions: Record<string, string>[]): BettingOpportunity[] => {
    if (!predictions || predictions.length === 0) return [];

    return predictions
      .filter(pred => {
        // Show all games, not just ones with Vegas lines
        const matchup = pred.matchup || pred.Matchup;
        return matchup && matchup.trim().length > 0;
      })
      .map(pred => {
        // Handle both API format and Google Sheets format
        const edgeStr = pred.edge || pred.Edge;
        const edge = (edgeStr && edgeStr !== 'N/A') ? parseFloat(edgeStr) : 0;
        const ourLine = parseFloat(pred.predicted_difference || pred['Predicted Difference']) || 0;
        const vegasLineStr = pred.vegas_line || pred.Line;
        const vegasLine = (vegasLineStr && vegasLineStr !== 'N/A') ? parseFloat(vegasLineStr) : 0;

        // Handle field names for both formats
        const favorite = pred.favorite || pred.Favorite;
        const underdog = pred.underdog || pred.Underdog;
        const matchup = pred.matchup || pred.Matchup;
        const betRecommendation = pred.betting_recommendation || pred['Betting Recommendation'];
        
        // Use existing bet recommendation if available, otherwise generate
        let betRec = betRecommendation || '';
        if (!betRec) {
          // Updated: 0-2 edge band has 58.3% win rate, so generate recommendations for all edges
          if (edge > 0 && vegasLine > 0) {
            if (ourLine > vegasLine) {
              betRec = `Take ${favorite} -${vegasLine}`;
            } else {
              betRec = `Take ${underdog} +${vegasLine}`;
            }
          } else {
            betRec = 'No line available';
          }
        }

        // Use existing edge band and confidence if available
        const edgeBand = pred.edge_band || pred['Edge Band'] || '';
        const confidence = pred.strategy || pred.Strategy || '';
        
        // Fallback edge band classification if not provided
        let finalConfidence = confidence;
        let finalEdgeBand = edgeBand;
        
        if (!finalEdgeBand) {
          if (edge >= 12) {
            finalConfidence = 'Elite (57.1%)';
            finalEdgeBand = '12+';
          } else if (edge >= 9) {
            finalConfidence = 'Strong (61.0%)';
            finalEdgeBand = '9-12';
          } else if (edge >= 7) {
            finalConfidence = 'Below Average (40.7%)';
            finalEdgeBand = '7-9';
          } else if (edge >= 5) {
            finalConfidence = 'Average (52.5%)';
            finalEdgeBand = '5-7';
          } else if (edge >= 2) {
            finalConfidence = 'Good (55.1%)';
            finalEdgeBand = '2-5';
          } else {
            finalConfidence = 'Good (58.3%)';
            finalEdgeBand = '0-2';
          }
        }

        return {
          matchup: matchup || '',
          favorite: favorite || '',
          underdog: underdog || '',
          ourLine,
          vegasLine,
          edge,
          betRecommendation: betRec,
          confidence: finalConfidence,
          edgeBand: finalEdgeBand
        };
      })
      .sort((a, b) => b.edge - a.edge);
  };

  const calculatePerformance = (coverAnalysis: Record<string, string>[], currentOpps: number): PerformanceMetrics => {
    if (!coverAnalysis || coverAnalysis.length === 0) {
      return {
        totalBets: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        currentWeekOpportunities: currentOpps
      };
    }

    const validBets = coverAnalysis.filter(bet => 
      bet.Result === 'WIN' || bet.Result === 'LOSS'
    );

    const wins = validBets.filter(bet => bet.Result === 'WIN').length;
    const losses = validBets.filter(bet => bet.Result === 'LOSS').length;
    const winRate = validBets.length > 0 ? (wins / validBets.length) * 100 : 0;

    return {
      totalBets: validBets.length,
      wins,
      losses,
      winRate,
      currentWeekOpportunities: currentOpps
    };
  };

  const getEdgeBandColor = (edgeBand: string) => {
    switch (edgeBand) {
      case '12+': return 'border-purple-500 bg-purple-50';
      case '9-12': return 'border-blue-500 bg-blue-50';
      case '7-9': return 'border-green-500 bg-green-50';
      case '5-7': return 'border-yellow-500 bg-yellow-50';
      case '2-5': return 'border-orange-500 bg-orange-50';
      default: return 'border-gray-500 bg-gray-50';
    }
  };

  const getEdgeBandEmoji = (edgeBand: string) => {
    switch (edgeBand) {
      case '12+': return '👑';
      case '9-12': return '💎';
      case '7-9': return '🔥';
      case '5-7': return '🟡';
      case '2-5': return '🟠';
      default: return '⚫';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600 text-lg">Loading betting opportunities...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md bg-white p-8 rounded-lg shadow-lg">
          <div className="text-red-600 text-xl font-semibold mb-2">🚨 Connection Error</div>
          <div className="text-gray-600 mb-4">{error}</div>
          <button 
            onClick={fetchBettingData}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
          >
            🔄 Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Group opportunities by edge band
  const groupedOpportunities = opportunities.reduce((groups, opp) => {
    const band = opp.edgeBand;
    if (!groups[band]) groups[band] = [];
    groups[band].push(opp);
    return groups;
  }, {} as Record<string, BettingOpportunity[]>);

  const bandOrder = ['12+', '9-12', '7-9', '5-7', '2-5', '0-2'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Clean Header */}
      {/* Notification Banner */}
      {notification && (
        <div className="bg-blue-600 text-white px-6 py-3">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <div className="flex items-center">
              <span className="text-lg mr-3">🔔</span>
              <div>
                <div className="font-semibold">{notification.subject}</div>
                <div className="text-sm opacity-90">
                  {new Date(notification.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
            <button 
              onClick={dismissNotification}
              className="text-white hover:bg-blue-700 px-3 py-1 rounded"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">🏈 CV Bets</h1>
              <div className="flex items-center mt-2 text-sm text-gray-600">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isRealTime ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                <span>{isRealTime ? 'Live Data' : 'Cached Data'}</span>
                <span className="mx-2">•</span>
                <span>Updated: {new Date(lastUpdated).toLocaleTimeString()}</span>
                <button 
                  onClick={fetchBettingData}
                  className="ml-3 text-blue-600 hover:text-blue-800"
                  title="Refresh data"
                >
                  🔄
                </button>
              </div>
              <p className="text-gray-600">NCAA Football Predictions & Analysis</p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right">
                <div className="text-3xl font-bold text-green-600">{performance.winRate.toFixed(1)}%</div>
                <div className="text-sm text-gray-500">Win Rate</div>
              </div>
              <button
                onClick={fetchBettingData}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        
        {/* Performance Summary */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📊 Season Performance</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{performance.totalBets}</div>
              <div className="text-sm text-gray-500">Total Bets</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{performance.wins}</div>
              <div className="text-sm text-gray-500">Wins</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{performance.losses}</div>
              <div className="text-sm text-gray-500">Losses</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{opportunities.length}</div>
              <div className="text-sm text-gray-500">Current Games</div>
            </div>
          </div>
        </div>

        {/* Edge Band Performance Analysis */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🎯 Edge Band Performance (338 Games)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="text-lg font-bold text-purple-700">57.1%</div>
              <div className="text-sm text-gray-600">12+ Edge</div>
              <div className="text-xs text-gray-500">63 games</div>
            </div>
            <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-lg font-bold text-blue-700">61.0%</div>
              <div className="text-sm text-gray-600">9-12 Edge</div>
              <div className="text-xs text-gray-500">41 games</div>
            </div>
            <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-lg font-bold text-red-700">40.7%</div>
              <div className="text-sm text-gray-600">7-9 Edge</div>
              <div className="text-xs text-gray-500">27 games</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="text-lg font-bold text-yellow-700">52.5%</div>
              <div className="text-sm text-gray-600">5-7 Edge</div>
              <div className="text-xs text-gray-500">40 games</div>
            </div>
            <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-lg font-bold text-green-700">55.1%</div>
              <div className="text-sm text-gray-600">2-5 Edge</div>
              <div className="text-xs text-gray-500">98 games</div>
            </div>
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="text-lg font-bold text-emerald-700">58.3%</div>
              <div className="text-sm text-gray-600">0-2 Edge</div>
              <div className="text-xs text-gray-500">60 games</div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center text-sm text-gray-600">
              <span>Overall RF Model Performance:</span>
              <span className="font-semibold text-gray-900">182-156 (53.8%)</span>
            </div>
          </div>
        </div>

        {/* Predictions by Edge Band */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-xl font-semibold text-gray-900">
              🎯 Betting Opportunities ({opportunities.length})
            </h2>
            <p className="text-gray-600">Organized by edge strength with historical win rates</p>
          </div>
          
          <div className="p-6">
            {opportunities.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-4xl mb-4">📭</div>
                <div className="text-xl">No betting opportunities available</div>
                <div className="text-sm">Check back later for new predictions</div>
              </div>
            ) : (
              <div className="space-y-6">
                {bandOrder.map(band => {
                  const bandOpps = groupedOpportunities[band];
                  if (!bandOpps || bandOpps.length === 0) return null;

                  const valueBets = bandOpps.filter(opp => opp.edge >= 0.1).length;

                  return (
                    <div key={band} className={`border-2 rounded-lg ${getEdgeBandColor(band)}`}>
                      <div className="p-4 border-b border-gray-200">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center space-x-3">
                            <span className="text-2xl">{getEdgeBandEmoji(band)}</span>
                            <div>
                              <div className="font-semibold text-gray-900">
                                {band} Point Edge
                              </div>
                              <div className="text-sm text-gray-600">
                                {bandOpps.length} games
                                {valueBets > 0 && (
                                  <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                                    {valueBets} VALUE BETS
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-gray-900">{bandOpps[0].confidence}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 space-y-3">
                        {bandOpps.map((opp, index) => (
                          <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <div className="font-semibold text-gray-900 mb-2">
                                  {opp.matchup}
                                </div>
                                {opp.edge >= 0.1 ? (
                                  <div className="text-green-700 font-medium mb-1">
                                    ✅ {opp.betRecommendation}
                                  </div>
                                ) : (
                                  <div className="text-gray-500 mb-1">
                                    ❌ No Vegas line available
                                  </div>
                                )}
                                <div className="text-xs text-gray-500">
                                  Our Model: {opp.ourLine.toFixed(1)} | Vegas Line: {opp.vegasLine.toFixed(1)}
                                </div>
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-2xl font-bold text-gray-900">
                                  +{opp.edge.toFixed(1)}
                                </div>
                                <div className="text-xs text-gray-500">Edge</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}