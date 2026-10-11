/* eslint-disable no-console */
/**
 * Generates a Postman v2.1 collection from the OpenAPI spec (single source of truth).
 *   npm run docs:postman
 */
const fs = require('fs');
const path = require('path');

// The spec reads env only for the API prefix; provide harmless defaults so no .env is required.
process.env.MONGODB_URI ||= 'mongodb://localhost:27017/unused';
process.env.JWT_ACCESS_SECRET ||= 'postman-generator-placeholder-secret-0000';
process.env.LOG_LEVEL = 'silent';

const spec = require('../src/docs/openapi');

const OUTPUT = path.resolve(__dirname, '../docs/postman/CRM-Sales-Management.postman_collection.json');
const METHODS = ['get', 'post', 'patch', 'put', 'delete'];

const resolveParam = (p) => (p.$ref ? spec.components.parameters[p.$ref.split('/').pop()] : p);

const sampleFor = (schema = {}) => {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  return '';
};

const LOGIN_TEST = [
  'const body = pm.response.json();',
  'if (body.success && body.data && body.data.accessToken) {',
  '  pm.collectionVariables.set("accessToken", body.data.accessToken);',
  '}',
];

const CAPTURE_ID = (variable) => [
  'const body = pm.response.json();',
  `if (body.success && body.data && body.data._id) pm.collectionVariables.set("${variable}", body.data._id);`,
];

const ID_VARIABLE_BY_TAG = {
  Users: 'userId',
  Leads: 'leadId',
  Customers: 'customerId',
  Deals: 'dealId',
  Activities: 'activityId',
};

function buildRequest(route, method, operation) {
  const tag = operation.tags[0];
  const params = (operation.parameters || []).map(resolveParam);
  const idVar = ID_VARIABLE_BY_TAG[tag] || 'id';
  const pathSegments = route.replace(/^\//, '').split('/').map((segment) => (segment === '{id}' ? `{{${idVar}}}` : segment));

  const query = params
    .filter((p) => p.in === 'query')
    .map((p) => ({ key: p.name, value: String(sampleFor(p.schema)), description: p.description, disabled: true }));

  const content = operation.requestBody?.content?.['application/json'];
  const example = content?.example ?? Object.values(content?.examples || {})[0]?.value;

  const request = {
    method: method.toUpperCase(),
    header: example ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: {
      raw: `{{baseUrl}}/${pathSegments.join('/')}`,
      host: ['{{baseUrl}}'],
      path: pathSegments,
      ...(query.length && { query }),
    },
    description: operation.description,
  };
  if (example) request.body = { mode: 'raw', raw: JSON.stringify(example, null, 2), options: { raw: { language: 'json' } } };
  if (Array.isArray(operation.security) && operation.security.length === 0) request.auth = { type: 'noauth' };

  const item = { name: operation.summary, request };

  let script = null;
  if (route === '/auth/login' || route === '/auth/register' || route === '/auth/refresh') script = LOGIN_TEST;
  else if (method === 'post' && route.split('/').length === 2 && ID_VARIABLE_BY_TAG[tag]) script = CAPTURE_ID(idVar);
  if (script) item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: script } }];

  return { tag, item };
}

function main() {
  const folders = new Map(spec.tags.map((t) => [t.name, { name: t.name, description: t.description, item: [] }]));

  for (const [route, operations] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      if (!operations[method]) continue;
      const { tag, item } = buildRequest(route, method, operations[method]);
      folders.get(tag).item.push(item);
    }
  }

  const collection = {
    info: {
      name: spec.info.title,
      description:
        'Generated from the OpenAPI spec (`npm run docs:postman`). Run **Auth → Log in** first: the access token is stored in `{{accessToken}}` and the refresh token cookie is handled by Postman. Creating a lead/customer/deal/activity stores its id for the follow-up requests.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
    variable: [
      { key: 'baseUrl', value: `http://localhost:5000${spec.servers[0].url}` },
      { key: 'accessToken', value: '' },
      ...Object.values(ID_VARIABLE_BY_TAG).map((key) => ({ key, value: '' })),
    ],
    item: [...folders.values()],
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(collection, null, 2)}\n`);
  const count = collection.item.reduce((total, folder) => total + folder.item.length, 0);
  console.log(`Postman collection written to ${path.relative(process.cwd(), OUTPUT)} (${count} requests)`);
}

main();
