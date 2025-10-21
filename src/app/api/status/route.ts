import { NextResponse } from 'next/server';

const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:8001';

export async function GET() {
  try {
    // Check API server health
    let apiServerStatus = 'offline';
    let systemStatus = null;
    
    try {
      const healthResponse = await fetch(`${API_SERVER_URL}/api/health`, {
        timeout: 3000
      });
      
      if (healthResponse.ok) {
        apiServerStatus = 'online';
        
        // Also try to get system status if available
        try {
          const statusResponse = await fetch(`${API_SERVER_URL}/api/performance/summary`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            systemStatus = statusData;
          }
        } catch (e) {
          // System status endpoint might not be available
        }
      }
    } catch (e) {
      // API server is offline
    }
    
    return NextResponse.json({
      success: true,
      status: {
        apiServer: apiServerStatus,
        dashboard: 'online',
        lastChecked: new Date().toISOString(),
        system: systemStatus
      }
    });
    
  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check system status'
    }, { status: 500 });
  }
}