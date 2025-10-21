import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import fs from 'fs';
import fetch from 'node-fetch';

// Google Sheets configuration
const SHEET_ID = "1Rmj5fbhwkQivv98hR5GqCNhBkV8-EwEtEA74bsC6wAU";
const SERVICE_ACCOUNT_PATH = "C:\\Users\\31198\\AppData\\Local\\Programs\\Python\\Python313\\kentraining.json";

interface SheetRow {
  [key: string]: string;
}

export async function GET() {
  try {
    // ENHANCED: Try API server first, fallback to direct Google Sheets (preserves existing)
    const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:8001';
    
    // Try to get data from API server for real-time updates
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const apiResponse = await fetch(`${API_SERVER_URL}/api/predictions/current`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (apiResponse.ok) {
        const apiData = await apiResponse.json() as { success: boolean; data: { predictions: SheetRow[]; generated_at: string } };
        if (apiData.success) {
          console.log('Data fetched from API server (real-time)');
          
          // Also get results data
          const resultsController = new AbortController();
          const resultsTimeoutId = setTimeout(() => resultsController.abort(), 5000);
          
          const resultsResponse = await fetch(`${API_SERVER_URL}/api/results/current`, {
            signal: resultsController.signal
          });
          
          clearTimeout(resultsTimeoutId);
          const resultsData = resultsResponse.ok ? await resultsResponse.json() as { data: { cover_analysis: SheetRow[]; vegas_spread_analysis: SheetRow[] } } : null;
          
          return NextResponse.json({
            predictions: apiData.data.predictions || [],
            coverAnalysis: resultsData?.data?.cover_analysis || [],
            results: resultsData?.data?.vegas_spread_analysis || [],
            lastUpdated: apiData.data.generated_at || new Date().toISOString(),
            source: 'api_server',
            realTime: true
          });
        }
      }
    } catch {
      console.log('API server unavailable, falling back to Google Sheets');
    }
    
    // FALLBACK: Original Google Sheets logic (PRESERVED EXACTLY)
    let credentials;
    
    if (process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_CLIENT_EMAIL) {
      credentials = {
        type: "service_account",
        project_id: "kentraining-440012",
        private_key_id: "bfd129faf278ba554020eca4dc44b153ea74d0db",
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: "114464750380722823",
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/kptraining%40kentraining-440012.iam.gserviceaccount.com",
        universe_domain: "googleapis.com"
      };
    } else {
      // Fallback for local development
      credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    }
    
    // Setup Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    console.log('Attempting to fetch Google Sheets data...');
    
    // Fetch predictions data
    const predictionsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Predictions!A:Z',
    });
    
    console.log('Predictions fetched successfully');
    
    // Fetch cover analysis data
    const coverResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Cover Analysis!A:Z',
    });
    
    console.log('Cover analysis fetched successfully');
    
    // Fetch results data
    const resultsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Results!A:Z',
    });
    
    console.log('Results fetched successfully');
    
    const predictionsData = predictionsResponse.data.values || [];
    const coverData = coverResponse.data.values || [];
    const resultsData = resultsResponse.data.values || [];
    
    // Convert to structured data (PRESERVED EXISTING LOGIC)
    const predictions: SheetRow[] = predictionsData.length > 1 ? 
      predictionsData.slice(1).map(row => {
        const headers = predictionsData[0];
        const obj: SheetRow = {};
        headers.forEach((header: string, index: number) => {
          obj[header] = row[index] || '';
        });
        return obj;
      }) : [];
    
    const coverAnalysis: SheetRow[] = coverData.length > 4 ? 
      coverData.slice(4).map(row => {
        const headers = coverData[3];
        const obj: SheetRow = {};
        headers.forEach((header: string, index: number) => {
          obj[header] = row[index] || '';
        });
        return obj;
      }) : [];
    
    const results: SheetRow[] = resultsData.length > 1 ? 
      resultsData.slice(1).map(row => {
        const headers = resultsData[0];
        const obj: SheetRow = {};
        headers.forEach((header: string, index: number) => {
          obj[header] = row[index] || '';
        });
        return obj;
      }) : [];
    
    return NextResponse.json({
      predictions,
      coverAnalysis,
      results,
      lastUpdated: new Date().toISOString(),
      source: 'google_sheets',
      realTime: false
    });
    
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}