const express = require('express');
const router = express.Router();

const config = require('../config');
const { badge } = require('../lib/badge');

const sanitize = require('sanitize');

router.get('/', function(req, res) {
  res.setLocale(config.locale);
  res.render('index', {
    community: config.community,
    tokenRequired: !!config.inviteToken,
    recaptchaSiteKey: config.recaptchaSiteKey
  });
});

async function recaptchaIfNeeded(response) {
  let hasSiteKey = !!config.recaptchaSiteKey;
  let hasSecretKey = !!config.recaptchaSecretKey;

  let canReCap = hasSiteKey && hasSecretKey;

  if (!canReCap) {
    return Promise.resolve()
  }

  const form = new FormData();
  form.set("response", response)
  form.set("secret", config.recaptchaSecretKey)

  let result = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: form
  })

  let body = await result.json();

  if (body.success) {
    return Promise.resolve();
  } else {
    throw new Error("Invalid captcha.")
  }
}


async function triggerInvite(email) {
  let url = 'https://'+ config.slackUrl + '/api/users.admin.invite'
  
  const body = new FormData();
  body.set("email", email);
  body.set("token", config.slacktoken);
  body.set("set_active", true)

  let result = await fetch(url, {
    method: 'POST',
    body
  });

  let resultBody = await result.json()
  // body looks like:
  //   {"ok":true}
  //       or
  //   {"ok":false,"error":"already_invited"
  
  if (resultBody.ok) {
    return 'Success! Check &ldquo;'+ email +'&rdquo; for an invite from Slack.';
  }

  let error = resultBody.error;

  if (error === 'already_invited' || error === 'already_in_team') {
    return 'Success! You were already invited.<br>' +
              'Visit <a href="https://'+ config.slackUrl +'">'+ config.community +'</a>';
  } else if (error === 'invalid_email') {
    error = 'The email you entered is an invalid email.';
  } else if (error === 'invalid_auth') {
    error = 'Something has gone wrong. Please contact a system administrator.';
  }

  throw new Error(error);
}


router.post('/invite', async function(req, res) {
  try {
    const errMsg = [];
    if (!req.body.email) {
      errMsg.push('your email is required');
    }

    if (!!config.inviteToken) {
      if (!req.body.token) {
        errMsg.push('valid token is required');
      }

      if (req.body.token && req.body.token !== config.inviteToken) {
        errMsg.push('the token you entered is wrong');
      }
    }

    if (errMsg.length > 0) {
      throw new Error(errMsg.join(' and ') + '.')
    }
    
    await recaptchaIfNeeded(req.body['g-recaptcha-response']);

    let message = await triggerInvite(req.body.email, res);

    return res.render('result', {
      community: config.community,
      message: message,
      isFailed: false
    });
  } catch (error) {
    return res.render('result', {
      community: config.community,
      message: 'Failed! ' + error,
      isFailed: true
    });
  }
});

router.get('/badge.svg', async (req, res) => {
  let queryString = new URLSearchParams({
    token: config.slacktoken,
    presence: true,
  }).toString()

  let url = `https://${config.slackUrl}/api/users.list?${queryString}`;

  try {
    let result = await fetch(url);
    let body = await result.json();

    if (!body.members) {
      throw new Error('missing members in response')
    }

    const members = body.members.filter(function(m) {
      return !m.is_bot;
    });

    const total = members.length;
    const presence = members.filter(function(m) {
      return m.presence === 'active';
    }).length;

    const hexColor = /^([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

    sanitize.middleware.mixinFilters(req);

    res.type('svg');
    res.set('Cache-Control', 'max-age=0, no-cache');
    res.set('Pragma', 'no-cache');
    res.send(
      badge(
          presence,
          total,
          req.queryPattern('colorA', hexColor),
          req.queryPattern('colorB', hexColor)
      )
    );
  } catch (error) {
    return res.status(404).send('Not found')
  }
});

module.exports = router;
