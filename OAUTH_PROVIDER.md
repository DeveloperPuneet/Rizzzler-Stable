# Login with Rizzzler — OAuth Provider Implementation Guide

Rizzzler is now an OAuth 2.0 provider! Other developers can integrate "Login with Rizzzler" into their applications, similar to "Login with Google" or "Login with GitHub".

## Table of Contents

- [Overview](#overview)
- [Getting Started for App Developers](#getting-started-for-app-developers)
- [OAuth 2.0 Authorization Code Flow](#oauth-20-authorization-code-flow)
- [Endpoints Reference](#endpoints-reference)
- [Scopes](#scopes)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [For Rizzzler Admins](#for-rizzzler-admins)

---

## Overview

With OAuth 2.0 integration, other applications can:
- Allow users to sign up/login using their Rizzzler account
- Request access to limited user information (profile, email, avatar)
- Provide a frictionless authentication experience
- Never store Rizzzler passwords (authentication is handled by Rizzzler)

### What Users Can Authorize

When a user logs in with Rizzzler, they approve access to:
- **Profile:** Username and display name
- **Email:** Email address
- **Avatar:** Profile picture

Users can revoke app access anytime from their Rizzzler dashboard at `/dashboard/oauth-apps`.

---

## Getting Started for App Developers

### Step 1: Register Your Application

To get started, you need to:

1. Create a Rizzzler account
2. Contact the Rizzzler team or register your app via the dashboard (feature coming soon)
3. Receive:
   - **Client ID:** Identifier for your application
   - **Client Secret:** Password-like secret (keep this private!)
   - **Redirect URIs:** Allowed callback URLs after login

> **For now:** Contact the Rizzzler admin at your deployment URL to register your app manually.

### Step 2: Implement the Login Flow

Use the OAuth 2.0 Authorization Code grant type:

1. Redirect users to `/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&state=...`
2. Users see your app and approve permissions
3. Redirect back to your app with an authorization code
4. Exchange code for an access token (server-to-server)
5. Use token to fetch user info

### Step 3: Use the "Login with Rizzzler" Button

Add a button to your login page:

```html
<a href="https://your-rizzzler-instance.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://yourapp.com/auth/callback&response_type=code&state=RANDOM_STATE&scope=profile+email+avatar">
  Login with Rizzzler
</a>
```

---

## OAuth 2.0 Authorization Code Flow

This is the standard OAuth 2.0 Authorization Code flow:

### Step 1: Authorization Request (Browser)

User clicks "Login with Rizzzler" button. Redirect to:

```
https://rizzzler.com/oauth/authorize?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=https://yourapp.com/auth/callback&
  response_type=code&
  state=RANDOM_CSRF_TOKEN&
  scope=profile+email+avatar
```

**Parameters:**
- `client_id` (required): Your app's client ID
- `redirect_uri` (required): Where Rizzzler sends the user back (must be registered)
- `response_type` (required): Must be `code`
- `state` (required): Random string for CSRF protection (store this in session)
- `scope` (optional): Space-separated scopes (default: `profile email avatar`)

### Step 2: User Approves (Rizzzler)

User sees a permission screen:
> "Your App" wants to access your Rizzzler account.  
> ✓ Your username and display name  
> ✓ Your email address  
> ✓ Your profile avatar  
> [Cancel] [Allow]

If approved, Rizzzler redirects to your `redirect_uri`:

```
https://yourapp.com/auth/callback?
  code=AUTHORIZATION_CODE&
  state=RANDOM_CSRF_TOKEN
```

### Step 3: Exchange Code for Token (Your Server)

On your backend, verify the `state` parameter matches what you stored, then POST:

```bash
curl -X POST https://rizzzler.com/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=AUTHORIZATION_CODE&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&redirect_uri=https://yourapp.com/auth/callback"
```

Response:

```json
{
  "access_token": "abcdef123456...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "scope": "profile email avatar"
}
```

### Step 4: Fetch User Info (Your Server)

Use the access token to get user information:

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" \
  https://rizzzler.com/oauth/userinfo
```

Response:

```json
{
  "sub": "507f1f77bcf86cd799439011",
  "username": "alice",
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "picture": "https://rizzzler.com/file/507f1f77bcf86cd799439012"
}
```

### Step 5: Create Session

Create a user account in your app (or log in existing user) and set a session cookie.

---

## Endpoints Reference

### GET /oauth/authorize

Initiates the OAuth flow. Redirects user to Rizzzler's permission screen.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | Your app's client ID |
| `redirect_uri` | Yes | URL to redirect after approval (must be registered) |
| `response_type` | Yes | Must be `code` |
| `state` | Yes | Random string for CSRF protection (you generate this) |
| `scope` | No | Space-separated scopes (default: `profile email avatar`) |

**Response:** Redirects to Rizzzler's permission page (if user not logged in, redirects to login first)

---

### POST /oauth/token

Exchanges an authorization code for an access token. **Call this from your backend, not the browser.**

**Request Body (form-urlencoded):**

```
grant_type=authorization_code&
code=AUTHORIZATION_CODE&
client_id=YOUR_CLIENT_ID&
client_secret=YOUR_CLIENT_SECRET&
redirect_uri=https://yourapp.com/auth/callback
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `grant_type` | Yes | Must be `authorization_code` |
| `code` | Yes | Authorization code from redirect |
| `client_id` | Yes | Your app's client ID |
| `client_secret` | Yes | Your app's client secret (keep private!) |
| `redirect_uri` | Yes | Must match the redirect_uri used in authorization request |

**Response (200 OK):**

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "scope": "profile email avatar"
}
```

**Error Response (400 Bad Request):**

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code not found or expired."
}
```

---

### GET /oauth/userinfo

Fetches the authenticated user's profile information.

**Request Header:**

```
Authorization: Bearer ACCESS_TOKEN
```

**Response (200 OK):**

```json
{
  "sub": "507f1f77bcf86cd799439011",
  "username": "alice",
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "picture": "https://rizzzler.com/file/507f1f77bcf86cd799439012"
}
```

Fields returned depend on the requested scopes:
- `sub`: Always returned (unique user ID)
- `username`, `name`: Returned if `profile` scope granted
- `email`: Returned if `email` scope granted
- `picture`: Returned if `avatar` scope granted

**Error Response (401 Unauthorized):**

```json
{
  "error": "invalid_token",
  "error_description": "Token not found or expired."
}
```

---

## Scopes

Currently, three scopes are available:

| Scope | Description | Fields Returned |
|-------|-------------|-----------------|
| `profile` | User's profile information | `username`, `name` |
| `email` | User's email address | `email` |
| `avatar` | User's profile avatar URL | `picture` |

Request multiple scopes separated by spaces:

```
https://rizzzler.com/oauth/authorize?...&scope=profile+email+avatar
```

---

## Examples

### Node.js/Express Example

```javascript
const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
const crypto = require("crypto");

const app = express();
app.use(session({ secret: "your-secret", resave: false, saveUninitialized: false }));

const CLIENT_ID = "your-client-id";
const CLIENT_SECRET = "your-client-secret";
const REDIRECT_URI = "http://localhost:3001/auth/callback";
const RIZZZLER_BASE = "https://rizzzler.com";

// Route 1: Redirect to Rizzzler
app.get("/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    state,
    scope: "profile email avatar",
  });

  res.redirect(`${RIZZZLER_BASE}/oauth/authorize?${params}`);
});

// Route 2: Handle callback
app.get("/auth/callback", async (req, res) => {
  const { code, state } = req.query;

  // Verify state (CSRF protection)
  if (state !== req.session.oauthState) {
    return res.status(403).send("CSRF token mismatch");
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch(`${RIZZZLER_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const { access_token } = await tokenRes.json();

    // Fetch user info
    const userRes = await fetch(`${RIZZZLER_BASE}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = await userRes.json();

    // Create session
    req.session.user = user;
    req.session.accessToken = access_token;

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("Login failed");
  }
});

// Route 3: Protected dashboard
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.send(`Welcome, ${req.session.user.name}!`);
});

app.listen(3001);
```

### Python/Flask Example

```python
from flask import Flask, redirect, request, session, render_template
from requests_oauthlib import OAuth2Session
import secrets

app = Flask(__name__)
app.secret_key = "your-secret"

CLIENT_ID = "your-client-id"
CLIENT_SECRET = "your-client-secret"
REDIRECT_URI = "http://localhost:5000/auth/callback"
RIZZZLER_BASE = "https://rizzzler.com"

@app.route("/login")
def login():
    state = secrets.token_hex(16)
    session["oauth_state"] = state

    oauth = OAuth2Session(
        client_id=CLIENT_ID,
        redirect_uri=REDIRECT_URI,
        state=state,
        scope=["profile", "email", "avatar"]
    )

    authorization_url, state = oauth.authorization_url(f"{RIZZZLER_BASE}/oauth/authorize")
    return redirect(authorization_url)

@app.route("/auth/callback")
def callback():
    state = request.args.get("state")
    if state != session.get("oauth_state"):
        return "CSRF token mismatch", 403

    oauth = OAuth2Session(
        client_id=CLIENT_ID,
        state=state,
        redirect_uri=REDIRECT_URI
    )

    token = oauth.fetch_token(
        f"{RIZZZLER_BASE}/oauth/token",
        client_secret=CLIENT_SECRET,
        authorization_response=request.url
    )

    user = oauth.get(f"{RIZZZLER_BASE}/oauth/userinfo").json()
    
    session["user"] = user
    return redirect("/dashboard")

@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect("/login")
    return f"Welcome, {session['user']['name']}!"

if __name__ == "__main__":
    app.run(port=5000)
```

---

## Error Handling

### Common Errors

#### Invalid Client ID

```json
{
  "error": "invalid_client",
  "error_description": "Client not found or inactive."
}
```

**Fix:** Double-check your client ID and make sure your app is approved/active.

#### Redirect URI Mismatch

```json
{
  "error": "invalid_grant",
  "error_description": "Redirect URI does not match registered URI."
}
```

**Fix:** Make sure the `redirect_uri` parameter matches exactly what's registered (including protocol, domain, path).

#### Expired Authorization Code

```json
{
  "error": "invalid_grant",
  "error_description": "Authorization code has expired."
}
```

**Fix:** Authorization codes expire after 10 minutes. User must restart the login process.

#### Invalid or Expired Token

```json
{
  "error": "invalid_token",
  "error_description": "Token not found or expired."
}
```

**Fix:** Access tokens expire after 30 days. Implement token refresh (currently not supported; users must re-authenticate).

### User Cancels Authorization

If the user clicks "Cancel" on the permission screen:

```
https://yourapp.com/auth/callback?error=access_denied&state=RANDOM_CSRF_TOKEN
```

Handle this by:

```javascript
if (req.query.error === "access_denied") {
  return res.render("login", { message: "Authorization denied by user" });
}
```

---

## Troubleshooting

### "GitHub didn't share an email" -style error for Rizzzler

Rizzzler always requires an email, so this shouldn't happen. If it does, contact support.

### My app is receiving `access_denied` from all users

**Problem:** Likely CSRF attack detection. Users might be trying to login from an unknown state.

**Solution:**
- Verify you're storing `state` in `req.session` correctly
- Compare `state` from redirect with session value before proceeding
- Make sure session cookies are being set properly

### Access token returns 401 immediately after token exchange

**Problem:** Token may have expired during the process (unlikely), or the connection to Rizzzler is failing.

**Solution:**
- Log the full response from `/oauth/token`
- Verify the `access_token` is present and non-empty
- Try the request again (transient network issue)

### Users can't revoke access later

Users can manage connected apps in their Rizzzler dashboard at `/dashboard/oauth-apps`. They can click "Revoke" to remove your app's access. At that point, their access tokens are deleted.

---

## For Rizzzler Admins

### Registering New OAuth Apps

1. Go to `/admin/oauth-apps`
2. Click "New App" (feature coming soon)
3. Fill in app details:
   - **App Name:** Display name (shown to users during authorization)
   - **Description:** Short description of the app
   - **Website URL:** Link to your app
   - **Logo URL:** App icon (shown during authorization)
   - **Redirect URIs:** Comma-separated list of allowed callback URLs
4. Copy the `Client ID` and `Client Secret` and share with the developer

### Viewing App Analytics

In `/admin/oauth-apps`:
- See all registered apps
- View number of users who authorized each app
- See when each app was last used
- Track total authorizations per app

### Deactivating/Deleting Apps

- **Deactivate:** Disables the app without deleting data
- **Delete:** Removes the app and all associated tokens (users' access is revoked)

### Managing User Tokens

Click on an app to see all users who authorized it. You can:
- Revoke individual user tokens
- See when each token was created and last used

---

## Security Best Practices

### For App Developers

1. **Keep `client_secret` private**
   - Never embed it in frontend code
   - Never commit it to git
   - Use environment variables

2. **Validate CSRF tokens**
   - Always generate a random `state` parameter
   - Store it in the session
   - Compare it when handling the callback

3. **Use HTTPS only**
   - All redirects must be HTTPS (except `localhost` for dev)
   - Tokens travel in Authorization headers

4. **Handle errors gracefully**
   - Don't redirect to error pages that expose sensitive info
   - Log details server-side for debugging

5. **Refresh user sessions**
   - Don't rely on tokens for session management
   - Use your own session/cookie system
   - Tokens are for API access only

### For Rizzzler Operators

1. **Vet developers before approving apps**
   - Check their website and reputation
   - Verify redirect URIs are legitimate

2. **Monitor for suspicious activity**
   - High authorization rate on new apps
   - Tokens being revoked/re-authorized rapidly

3. **Keep client secrets safe**
   - Don't share them via unencrypted email
   - Require HTTPS for all callbacks

---

## What's Next?

### Planned Features

- [ ] Self-service app registration in dashboard
- [ ] Refresh token support (currently requires re-authentication after 30 days)
- [ ] Multiple redirect URIs per app (already supported, UI pending)
- [ ] Revoke all tokens for an app (bulk action)
- [ ] Developer webhooks (when users authorize/revoke)
- [ ] App usage analytics dashboard

---

## Questions or Issues?

Contact the Rizzzler team or open an issue on the [GitHub repository](https://github.com/DeveloperPuneet/Rizzzler).

---

## See Also

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [OpenID Connect](https://openid.net/connect/)
- [PKCE for Mobile Apps](https://tools.ietf.org/html/rfc7636)
