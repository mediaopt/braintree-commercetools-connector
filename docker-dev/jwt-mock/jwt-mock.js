// Differs from the commercetools connect-payment-integration-template, which runs the npm jwt-mock-server package
// instead (see its docker-compose.yaml). This mock follows the template's behavior as closely as possible.
const express = require('express');
const cors = require('cors');
const { generateKeyPair, exportJWK, calculateJwkThumbprint, SignJWT } = require('jose');

const PORT = process.env.PORT || 9002;

async function main() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  // Differs from the template: jwt-mock-server (node-jose) gives each new key a random kid. A thumbprint likewise changes
  // with every new key, so after a restart the processor's JWKS cache fetches the new key instead of reusing the old one
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
