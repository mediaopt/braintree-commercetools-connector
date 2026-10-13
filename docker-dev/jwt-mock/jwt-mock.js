// The commercetools connect-payment-integration-template's docker-dev/jwt-mock, except for the kid (see below).
const express = require('express');
const cors = require('cors');
const { generateKeyPair, exportJWK, calculateJwkThumbprint, SignJWT } = require('jose');

const PORT = process.env.PORT || 9002;

async function main() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  // Differs from the template, which publishes every new key under the fixed kid 'jwt-mock-key-1'. The processor's JWKS
  // cache is keyed by kid, so after a restart it would keep the old key. A thumbprint changes with every new key, so the
  // new key is fetched instead
  const kid = await calculateJwkThumbprint(publicJwk);
  publicJwk.kid = kid;
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/jwt/.well-known/jwks.json', (req, res) => {
    res.json({ keys: [publicJwk] });
  });

  app.post('/jwt/token', async (req, res) => {
    const token = await new SignJWT(req.body || {})
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    res.json({ token });
  });

  app.listen(PORT, () => {
    console.log(`jwt-mock listening on ${PORT}`);
  });
}

main();
