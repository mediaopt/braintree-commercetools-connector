const express = require('express');
const cors = require('cors');
const { generateKeyPair, exportJWK, calculateJwkThumbprint, SignJWT } = require('jose');

const PORT = process.env.PORT || 9002;

async function main() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  // A new key on every start gets a new kid, so the processor's JWKS cache fetches it instead of reusing the old key
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
