# Firebase Push Notification Setup Guide

This guide covers all manual configuration steps required to enable Firebase Cloud Messaging (FCM) push notifications in Gushu for both web and Android platforms.

---

## Table of Contents

1. [Firebase Console Setup](#1-firebase-console-setup)
2. [Web Push Configuration](#2-web-push-configuration)
3. [Android Configuration](#3-android-configuration)
4. [Supabase Edge Function Secret](#4-supabase-edge-function-secret)
5. [Testing Push Notifications](#5-testing-push-notifications)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Firebase Console Setup

### 1.1 Existing Firebase Project

The project uses Firebase project: **gu-shu**
- Project ID: `gu-shu`
- Messaging Sender ID: `633387691928`

### 1.2 Enable Cloud Messaging API

1. Go to [Firebase Console](https://console.firebase.google.com/project/gu-shu)
2. Navigate to **Project Settings** (gear icon)
3. Under **Cloud Messaging** tab, ensure Cloud Messaging API is enabled
4. If using the new API, you'll need to set up a Service Account

### 1.3 Generate Service Account Key

The Edge Function uses OAuth 2.0 with Service Account for sending notifications:

1. In Firebase Console > **Project Settings** > **Service accounts**
2. Click **Generate new private key**
3. Save the JSON file securely - this contains your credentials
4. **IMPORTANT:** You MUST add this as a secret in Supabase (see Section 4)

**The JSON file looks like this:**
```json
{
  "type": "service_account",
  "project_id": "gu-shu",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...@gu-shu.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

**CRITICAL:** The push notifications will NOT work until you configure these secrets in Supabase!

---

## 2. Web Push Configuration

### 2.1 Current Implementation

Web push notifications are handled through the browser's native Notification API:

- **Permission request:** `src/lib/notification-service.ts` - `requestNotificationPermission()`
- **Notification display:** `src/lib/notification-service.ts` - `showPrivacyNotification()`
- **Real-time subscription:** Supabase Realtime for foreground messages

### 2.2 How It Works

1. When a new message is inserted, a database trigger fires
2. The trigger calls the Edge Function with recipient tokens
3. Edge Function uses Firebase Admin SDK to send FCM messages
4. Web browsers receive FCM notifications via service worker (when backgrounded)
5. Forground messages show as in-app toasts via Realtime subscription

### 2.3 Browser Permissions

The app requests notification permissions on load. Users must:
1. Click "Allow" when the browser prompts for notification permission
2. Permissions persist across sessions

---

## 3. Android Configuration

### 3.1 google-services.json

The project already has `google-services.json` at:
```
android/app/google-services.json
```

This file was downloaded from Firebase Console for app ID: `com.gushu.app`

### 3.2 Android Build Configuration

The Android app is configured with Firebase dependencies in `android/app/build.gradle`:

```groovy
// Firebase BoM
implementation platform('com.google.firebase:firebase-bom:34.15.0')

// Firebase Cloud Messaging
implementation 'com.google.firebase:firebase-analytics'
implementation 'com.google.firebase:firebase-messaging'
```

The google-services plugin is applied:
```groovy
apply plugin: 'com.google.gms.google-services'
```

### 3.3 Android Manifest Permissions

Required permissions are already in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### 3.4 Build and Sync Android App

```bash
# Build the web app
npm run build

# Sync with Capacitor
npx cap sync android

# Open in Android Studio
npx cap open android
```

### 3.5 Notification Channel

A default notification channel is created programmatically in `src/lib/notification-service.ts`:

```typescript
await PushNotifications.createChannel({
  id: 'default',
  name: 'Default',
  importance: 5, // High importance
  visibility: 1, // Public
  sound: 'default',
  vibration: true,
});
```

---

## 4. Supabase Edge Function Secrets - REQUIRED

**WARNING: Push notifications will NOT work until these secrets are configured!**

The `push-notifications` Edge Function requires these environment secrets:

| Secret Name | Value | Required |
|-------------|-------|----------|
| `FIREBASE_PROJECT_ID` | `gu-shu` | YES |
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON from service account key file | YES |

### 4.1 Setting Secrets in Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Edge Functions** > select `push-notifications`
3. Click **Settings** or **Secrets**
4. Add secrets:
   - `FIREBASE_PROJECT_ID`: `gu-shu`
   - `FIREBASE_SERVICE_ACCOUNT`: Paste the **entire JSON content** from the service account key file

**Important:** The `FIREBASE_SERVICE_ACCOUNT` must be the complete JSON object including the `private_key` field.

### 4.2 Edge Function Location

The Edge Function is at:
```
supabase/functions/push-notifications/index.ts
```

It sends generic "Knock Knock" notifications that don't expose message content.

---

## 5. Testing Push Notifications

### 5.1 Web Browser Testing

#### Foreground Notifications

1. Open the app in Chrome
2. Sign in with your account
3. Grant notification permissions when prompted
4. Have another user send you a message
5. **Expected:** Toast notification appears in-app with "Knock Knock!"

#### Background Notifications

1. Sign in and grant permissions
2. Switch to another browser tab or minimize browser
3. Have another user send you a message
4. **Expected:** Browser push notification appears

#### Verify Token Storage

Check Supabase `user_push_tokens` table:
```sql
SELECT * FROM user_push_tokens WHERE user_id = 'YOUR_USER_ID';
```

### 5.2 Android App Testing

#### Install App

```bash
npm run build
npx cap sync android
npx cap open android
```

In Android Studio:
1. Connect device or start emulator (Android 8.0+)
2. Run app (Shift+F10)
3. Sign in and grant notification permission

#### Foreground Testing

1. Open the app
2. Have another user send you a message
3. **Expected:** In-app toast notification appears

#### Background Testing

1. Press Home button (app goes to background)
2. Have another user send you a message
3. **Expected:** System notification in notification shade

#### Terminated App Testing (Critical)

1. Open app, grant permissions, then swipe away from recent apps
2. Lock screen (optional)
3. Have another user send you a message
4. **Expected:** Push notification arrives even with app closed

### 5.3 Testing via Database

Manually trigger a notification by inserting a test message:

```sql
-- Insert test message (replace IDs with actual values)
INSERT INTO messages (conversation_id, sender_id, content)
VALUES ('YOUR_CONVERSATION_ID', 'OTHER_USER_ID', 'Test message');
```

The database trigger will automatically send push notifications to other participants.

---

## 6. Troubleshooting

### 6.0 Most Common Issue: Missing Secrets

If you see this error in Edge Function logs:
```
"error": "FIREBASE_SERVICE_ACCOUNT secret not configured"
```

**This means you haven't configured the Firebase secrets in Supabase Dashboard!**

**Solution:**
1. Go to Firebase Console > Project Settings > Service Accounts
2. Generate new private key (download JSON file)
3. Go to Supabase Dashboard > Edge Functions > push-notifications > Settings
4. Add `FIREBASE_PROJECT_ID` with value `gu-shu`
5. Add `FIREBASE_SERVICE_ACCOUNT` with the **entire JSON content** from step 2

### 6.1 Web Push Not Working

| Issue | Solution |
|-------|----------|
| No permission prompt | Check if site has notification permission in browser settings |
| Permissions denied | Reset permissions in browser settings, reload app |
| No notifications appear | Check browser console for errors, verify Edge Function secrets |
| Service worker issues | Clear cache, unregister service workers in DevTools |

### 6.2 Android Push Not Working

| Issue | Solution |
|-------|----------|
| App crashes on start | Verify `google-services.json` exists in correct location |
| No permission prompt | Check Android settings > Apps > Gushu > Notifications |
| Background notifications fail | Disable battery optimization for Gushu in device settings |
| Terminated notifications fail | Check `google-services.json` has correct package name (`com.gushu.app`) |

### 6.3 Edge Function Errors

Check Edge Function logs in Supabase Dashboard:
1. Go to **Edge Functions** > `push-notifications`
2. Click **Logs** tab
3. Look for errors related to:
   - Missing secrets (`FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`)
   - Invalid FCM tokens (automatically cleaned up)
   - Network/timeout issues

### 6.4 Debug Token Registration

Add console logging to verify token registration:

```typescript
// In src/lib/notification-service.ts
await PushNotifications.addListener("registration", async (token: Token) => {
  console.log("Push registration success, token:", token.value);
  // ... rest of handler
});
```

Check Logcat in Android Studio for these logs.

---

## Quick Reference: Key Files

| Component | Location |
|-----------|----------|
| Web/Android Notification Service | `src/lib/notification-service.ts` |
| Push Notifications Hook | `src/hooks/use-push-notifications.ts` |
| Edge Function | `supabase/functions/push-notifications/index.ts` |
| Database Trigger Migration | `supabase/migrations/20260621180000_production_push_notifications.sql` |
| Android Manifest | `android/app/src/main/AndroidManifest.xml` |
| Android Build Config | `android/app/build.gradle` |
| Google Services JSON | `android/app/google-services.json` (DO NOT COMMIT) |
| Capacitor Config | `capacitor.config.ts` |

---

## Architecture Overview

```
                           ┌─────────────────┐
                           │  Message Sent   │
                           │  (INSERT INTO   │
                           │   messages)     │
                           └────────┬────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   Database Trigger Fires      │
                    │   handle_new_message_push_    │
                    │   notification()              │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   Query user_push_tokens     │
                    │   for conversation recipients │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   Call Edge Function         │
                    │   push-notifications         │
                    └───────────────┬───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │   FCM API (OAuth 2.0)        │
                    │   Send "Knock Knock"         │
                    └───────────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
    ┌─────────▼─────────┐ ┌─────────▼─────────┐ ┌─────────▼─────────┐
    │   Web Browser     │ │   Android Device  │ │   iOS Device      │
    │   (Service Worker)│ │   (FCM Service)   │ │   (APNs/FCM)      │
    └───────────────────┘ └───────────────────┘ └───────────────────┘
```

---

## Security Notes

1. **Never commit** `google-services.json` to version control (it's in `.gitignore`)
2. **Service account JSON** should only be stored in Supabase secrets
3. Notification payload is **always generic** - no private message content exposed
4. RLS policies ensure users can only access their own tokens
5. Invalid tokens are automatically removed from the database

---

## Support Resources

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Capacitor Push Notifications Plugin](https://capacitorjs.com/docs/apis/push-notifications)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Android Notifications Overview](https://developer.android.com/develop/ui/views/notifications)

---

*Last updated: June 22, 2026*
