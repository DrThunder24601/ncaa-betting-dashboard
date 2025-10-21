import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const NOTIFICATIONS_DIR = path.join(process.cwd(), '..', 'notifications');

export async function GET() {
  try {
    // Try to get latest notification from filesystem
    const latestFile = path.join(NOTIFICATIONS_DIR, 'latest.json');
    
    if (fs.existsSync(latestFile)) {
      const notification = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
      return NextResponse.json({
        success: true,
        notification,
        hasNotification: true
      });
    }
    
    return NextResponse.json({
      success: true,
      notification: null,
      hasNotification: false
    });
    
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch notifications'
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    // Clear/mark notification as read
    const latestFile = path.join(NOTIFICATIONS_DIR, 'latest.json');
    
    if (fs.existsSync(latestFile)) {
      fs.unlinkSync(latestFile);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Notification cleared'
    });
    
  } catch (error) {
    console.error('Error clearing notification:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to clear notification'
    }, { status: 500 });
  }
}