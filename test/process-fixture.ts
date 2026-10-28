// Explicit subprocess-only test preload. Never imported by production code.
import { zone, realm, identity, rawRankings } from './fixtures.ts';
process.env.WCL_CLIENT_ID = 'synthetic-id';
process.env.WCL_CLIENT_SECRET = 'synthetic-secret';
globalThis.fetch = async (input, init) => {
  const url = String(input);
  let value: unknown;
  if (url === 'https://www.warcraftlogs.com/oauth/token') value = { access_token: 'synthetic-token', expires_in: 3600 };
  else if (url === 'https://www.warcraftlogs.com/api/v2/client') {
    const { query } = JSON.parse(String(init?.body));
    if (query.includes('query Zones')) value = { data: { worldData: { zones: [zone] } } };
    else if (query.includes('query Classes')) value = { data: { gameData: { classes: [{ id: identity.classID, name: 'Synthetic Mage' }] } } };
    else if (query.includes('query Realms')) value = { data: { worldData: { region: { servers: { data: [realm], has_more_pages: false } } } } };
    else if (query.includes('query Character')) value = { data: { characterData: { character: { ...identity, hidden: false } } } };
    else if (query.includes('query Rankings')) value = rawRankings();
    else throw Error('unexpected synthetic query');
  } else throw Error('unexpected endpoint in offline test');
  return Response.json(value);
};
