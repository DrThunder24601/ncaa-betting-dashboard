import { NextResponse } from 'next/server';

const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:8001';

export async function GET() {
  try {
    // Check API server health
    let apiServerStatus = 'offline';
    let systemStatus = null;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const healthResponse = await fetch(`${API_SERVER_URL}/api/health`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (healthResponse.ok) {
        apiServerStatus = 'online';
        
        // Also try to get system status if available
        try {
          const statusResponse = await fetch(`${API_SERVER_URL}/api/performance/summary`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            systemStatus = statusData;
          }
        } catch {
          // System status endpoint might not be available
        }
      }
    } catch {
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