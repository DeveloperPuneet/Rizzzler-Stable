# Quick Start: Implement "Login with Rizzzler" in 5 Minutes

This is a quick guide to add "Login with Rizzzler" to your app. For detailed documentation, see [OAUTH_PROVIDER.md](OAUTH_PROVIDER.md).

## Prerequisites
- Your app has a backend (Node.js, Python, PHP, etc.)
- You have a Rizzzler account and registered your app with the admin
- You have: `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`

## Step 1: Add Login Button

```html
<a href="https://YOUR_RIZZZLER_INSTANCE/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://yourapp.com/auth/callback&response_type=code&state=RANDOM_STATE&scope=profile+email+avatar">
  <button>Login with Rizzzler</button>
</a>
```

Replace:
- `YOUR_RIZZZLER_INSTANCE` with Rizzzler domain (e.g., `https://rizzzler.work.gd`)
- `YOUR_CLIENT_ID` with your app's Client ID
- `https://yourapp.com/auth/callback` with your redirect URL
- `RANDOM_STATE` with a random string (store in session for CSRF check)

## Step 2: Handle Callback

When user approves, they're redirected back with `code` and `state`:
```
https://yourapp.com/auth/callback?code=AUTH_CODE&state=STATE
```

Verify `state` matches what you stored, then exchange code for token:

### Node.js
```javascript
const fetch = require('node-fetch');

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  // Verify state
  if (state !== req.session.oauthState) {
    return res.status(403).send('CSRF token mismatch');
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://rizzzler.work.gd/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET',
        redirect_uri: 'https://yourapp.com/auth/callback'
      })
    });

    const { access_token } = await tokenRes.json();

    // Fetch user info
    const userRes = await fetch('https://rizzzler.work.gd/oauth/userinfo', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const user = await userRes.json();
    
    // Create session/login user
    req.session.user = user;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Login failed');
  }
});
```

### Python (Flask)
```python
from flask import Flask, session, redirect, request
import requests
from secrets import token_urlsafe

@app.route('/login')
def login():
    state = token_urlsafe()
    session['oauth_state'] = state
    
    params = {
        'client_id': 'YOUR_CLIENT_ID',
        'redirect_uri': 'https://yourapp.com/auth/callback',
        'response_type': 'code',
        'state': state,
        'scope': 'profile email avatar'
    }
    
    from urllib.parse import urlencode
    return redirect(f'https://rizzzler.work.gd/oauth/authorize?{urlencode(params)}')

@app.route('/auth/callback')
def callback():
    code = request.args.get('code')
    state = request.args.get('state')
    
    # Verify state
    if state != session.get('oauth_state'):
        return 'CSRF token mismatch', 403
    
    # Exchange code for token
    token_res = requests.post('https://rizzzler.work.gd/oauth/token', data={
        'grant_type': 'authorization_code',
        'code': code,
        'client_id': 'YOUR_CLIENT_ID',
        'client_secret': 'YOUR_CLIENT_SECRET',
        'redirect_uri': 'https://yourapp.com/auth/callback'
    })
    
    access_token = token_res.json()['access_token']
    
    # Fetch user info
    user_res = requests.get('https://rizzzler.work.gd/oauth/userinfo',
        headers={'Authorization': f'Bearer {access_token}'})
    
    user = user_res.json()
    
    # Create session
    session['user'] = user
    return redirect('/dashboard')
```

### PHP
```php
<?php
session_start();

if (isset($_GET['code'])) {
    $code = $_GET['code'];
    $state = $_GET['state'];
    
    // Verify state
    if ($state !== $_SESSION['oauth_state']) {
        die('CSRF token mismatch');
    }
    
    // Exchange code for token
    $ch = curl_init('https://rizzzler.work.gd/oauth/token');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
        'grant_type' => 'authorization_code',
        'code' => $code,
        'client_id' => 'YOUR_CLIENT_ID',
        'client_secret' => 'YOUR_CLIENT_SECRET',
        'redirect_uri' => 'https://yourapp.com/auth/callback'
    ]));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $data = json_decode($response, true);
    $access_token = $data['access_token'];
    
    // Fetch user info
    $ch = curl_init('https://rizzzler.work.gd/oauth/userinfo');
    curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer $access_token"]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    
    $response = curl_exec($ch);
    $user = json_decode($response, true);
    
    $_SESSION['user'] = $user;
    header('Location: /dashboard');
}
?>
```

## Step 3: Done!

Users can now login with:
- Username and avatar from Rizzzler
- Email address
- Unique ID for your database

## Common Issues

### "Redirect URI mismatch"
- Make sure `redirect_uri` in your URL exactly matches what's registered
- Check protocol (`http://` vs `https://`)
- Check for trailing slashes

### "Invalid code"
- Authorization codes expire after 10 minutes
- Each code can only be used once
- Make sure you're using the correct `client_secret`

### "Token expired"
- Access tokens last 30 days
- After that, user must login again
- (Refresh token support coming soon)

## User Management

Users can manage your app's access at:
```
https://your-rizzzler-instance/dashboard/oauth-apps
```

They can see when they authorized your app and revoke access anytime.

## Full Documentation

See [OAUTH_PROVIDER.md](OAUTH_PROVIDER.md) for:
- Detailed endpoint reference
- Error handling
- Security best practices
- Troubleshooting guide
- Advanced features

## Questions?

Contact the Rizzzler admin at your deployment URL.
