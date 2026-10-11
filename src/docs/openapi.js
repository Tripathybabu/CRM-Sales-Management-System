const env = require('../config/env');
const {
  ROLES,
  LEAD_SOURCES,
  LEAD_STATUS,
  PRIORITIES,
  CUSTOMER_STATUSES,
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  DEAL_STATUSES,
  ACTIVITY_TYPES,
  ACTIVITY_STATUS,
  ACTIVITY_RELATED_TYPES,
  ENTITY_TYPES,
  TIMELINE_ACTIONS,
} = require('../constants');

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const param = (name) => ({ $ref: `#/components/parameters/${name}` });
const enumOf = (values, extra = {}) => ({ type: 'string', enum: [...values], ...extra });
const objectId = { type: 'string', pattern: '^[a-f\\d]{24}$', example: '6650f1c2a8b4c2e3d4f5a6b7' };
const dateTime = { type: 'string', format: 'date-time' };
const arrayOf = (schema) => ({ type: 'array', items: schema });

const ERROR_RESPONSES = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  422: 'BusinessRule',
  423: 'Locked',
  429: 'TooManyRequests',
};
const errors = (...codes) =>
  Object.fromEntries(codes.map((code) => [code, { $ref: `#/components/responses/${ERROR_RESPONSES[code]}` }]));

const success = (description, dataSchema, { status = 200, paginated = false, example } = {}) => ({
  [status]: {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['success', 'message', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: description },
            data: dataSchema,
            ...(paginated && { meta: ref('PaginationMeta') }),
          },
        },
        ...(example && { example }),
      },
    },
  },
});

const body = (schema, example) => ({
  required: true,
  content: { 'application/json': { schema, ...(example && { example }) } },
});

const query = (name, schema, description) => ({ in: 'query', name, schema, description, required: false });
const listQuery = (name, values, description) =>
  query(name, { type: 'string', example: values.slice(0, 2).join(',') }, `${description} Comma-separated list of: ${values.join(', ')}`);
const sortQuery = (fields, def = '-createdAt') =>
  query('sort', { type: 'string', default: def }, `Comma-separated sort fields; prefix with "-" for descending. Allowed: ${fields.join(', ')}`);

const PAGINATION_PARAMS = [param('page'), param('limit')];
const CREATED_RANGE = [param('createdFrom'), param('createdTo')];

const op = (tag, summary, { description, roles, params = [], requestBody, responses, security } = {}) => ({
  tags: [tag],
  summary,
  description: [description, roles && `**Roles:** ${roles}`].filter(Boolean).join('\n\n'),
  ...(security !== undefined && { security }),
  ...(params.length && { parameters: params }),
  ...(requestBody && { requestBody }),
  responses,
});

const ALL = 'admin, sales_manager, sales_executive (record-level scope applies)';
const ADMIN_MANAGER = 'admin, sales_manager (managers limited to their team)';

/* ----------------------------------------------------------------------------
 * Schemas
 * ------------------------------------------------------------------------- */

const userRef = {
  type: 'object',
  properties: { _id: objectId, name: { type: 'string' }, email: { type: 'string', format: 'email' }, role: enumOf(Object.values(ROLES)) },
};

const address = {
  type: 'object',
  properties: {
    street: { type: 'string' },
    city: { type: 'string' },
    state: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string' },
  },
};

const schemas = {
  ErrorResponse: {
    type: 'object',
    required: ['success', 'message', 'code'],
    properties: {
      success: { type: 'boolean', example: false },
      message: { type: 'string', example: 'Lead not found' },
      code: { type: 'string', example: 'NOT_FOUND' },
      requestId: { type: 'string', format: 'uuid' },
      errors: {
        type: 'array',
        items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } },
      },
    },
  },
  PaginationMeta: {
    type: 'object',
    properties: {
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          totalRecords: { type: 'integer', example: 57 },
          totalPages: { type: 'integer', example: 3 },
          hasNextPage: { type: 'boolean', example: true },
          hasPrevPage: { type: 'boolean', example: false },
        },
      },
    },
  },
  UserRef: userRef,
  User: {
    type: 'object',
    properties: {
      _id: objectId,
      name: { type: 'string', example: 'Asha Verma' },
      email: { type: 'string', format: 'email', example: 'asha@crm.dev' },
      phone: { type: 'string', example: '+919876543210' },
      role: enumOf(Object.values(ROLES)),
      manager: { nullable: true, allOf: [userRef] },
      isActive: { type: 'boolean' },
      lastLoginAt: dateTime,
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  AuthSession: {
    type: 'object',
    properties: {
      user: ref('User'),
      accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      tokenType: { type: 'string', example: 'Bearer' },
      expiresIn: { type: 'string', example: '15m' },
    },
  },
  Lead: {
    type: 'object',
    properties: {
      _id: objectId,
      name: { type: 'string', example: 'Rahul Mehta' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      company: { type: 'string' },
      source: enumOf(LEAD_SOURCES),
      status: enumOf(Object.values(LEAD_STATUS)),
      priority: enumOf(PRIORITIES),
      description: { type: 'string' },
      lostReason: { type: 'string' },
      assignedTo: { nullable: true, allOf: [userRef] },
      createdBy: userRef,
      convertedAt: dateTime,
      convertedBy: userRef,
      customer: { nullable: true, description: 'Set after conversion', type: 'object' },
      deal: { nullable: true, description: 'Set after conversion (if a deal was created)', type: 'object' },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Customer: {
    type: 'object',
    properties: {
      _id: objectId,
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      company: { type: 'string' },
      address,
      description: { type: 'string' },
      status: enumOf(CUSTOMER_STATUSES),
      lead: { nullable: true, description: 'Original lead (populated on detail)', type: 'object' },
      assignedTo: userRef,
      createdBy: userRef,
      deals: { type: 'array', description: 'Associated deals (detail endpoint only)', items: { type: 'object' } },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Deal: {
    type: 'object',
    properties: {
      _id: objectId,
      name: { type: 'string', example: 'Annual CRM licence' },
      lead: { nullable: true, type: 'object' },
      customer: { type: 'object' },
      assignedTo: userRef,
      createdBy: userRef,
      value: { type: 'number', example: 25000 },
      currency: { type: 'string', example: 'USD' },
      probability: { type: 'number', minimum: 0, maximum: 100, example: 50 },
      expectedRevenue: { type: 'number', description: 'Computed server-side: value × probability / 100', example: 12500 },
      expectedCloseDate: dateTime,
      stage: enumOf(DEAL_STAGES),
      status: enumOf(DEAL_STATUSES, { description: 'Derived from stage' }),
      description: { type: 'string' },
      lostReason: { type: 'string' },
      closedAt: { ...dateTime, nullable: true },
      closedBy: { nullable: true, allOf: [userRef] },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Activity: {
    type: 'object',
    properties: {
      _id: objectId,
      type: enumOf(ACTIVITY_TYPES),
      title: { type: 'string' },
      description: { type: 'string' },
      status: enumOf(Object.values(ACTIVITY_STATUS), {
        description: '`overdue` is computed by the server (pending + due date in the past)',
      }),
      isOverdue: { type: 'boolean' },
      dueDate: dateTime,
      completedAt: dateTime,
      completedBy: userRef,
      outcome: { type: 'string' },
      assignedTo: userRef,
      createdBy: userRef,
      relatedType: enumOf(ACTIVITY_RELATED_TYPES),
      relatedId: { description: 'Populated related lead/customer/deal/user', type: 'object' },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  TimelineEvent: {
    type: 'object',
    properties: {
      _id: objectId,
      action: enumOf(Object.values(TIMELINE_ACTIONS)),
      entityType: enumOf(ENTITY_TYPES),
      entityId: objectId,
      performedBy: userRef,
      previousValue: { description: 'Any JSON value', nullable: true },
      newValue: { description: 'Any JSON value', nullable: true },
      message: { type: 'string' },
      lead: objectId,
      customer: objectId,
      deal: objectId,
      createdAt: dateTime,
    },
  },
  Config: {
    type: 'object',
    properties: {
      defaultCurrency: { type: 'string', example: 'USD' },
      maxDealCloseDays: { type: 'integer', example: 730 },
      stageProbabilities: {
        type: 'object',
        properties: Object.fromEntries(OPEN_DEAL_STAGES.map((stage) => [stage, { type: 'number' }])),
      },
      updatedAt: dateTime,
    },
  },
  DashboardSummary: {
    type: 'object',
    example: {
      leads: { total: 120, new: 30, contacted: 25, qualified: 20, unqualified: 10, converted: 25, lost: 10, conversionRate: 20.83 },
      customers: { total: 31 },
      deals: { total: 40, open: 22, won: 12, lost: 6, winRate: 66.67 },
      revenue: { totalRevenue: 340000, expectedRevenue: 118500, pipelineValue: 395000 },
      activities: { pending: 18, overdue: 4 },
    },
  },
  Pipeline: {
    type: 'object',
    example: {
      stages: [
        { stage: 'qualification', count: 10, totalValue: 120000, weightedValue: 12000, averageProbability: 10 },
        { stage: 'discovery', count: 8, totalValue: 96000, weightedValue: 24000, averageProbability: 25 },
        { stage: 'proposal', count: 6, totalValue: 90000, weightedValue: 45000, averageProbability: 50 },
        { stage: 'negotiation', count: 4, totalValue: 80000, weightedValue: 60000, averageProbability: 75 },
        { stage: 'won', count: 12, totalValue: 340000, weightedValue: 340000, averageProbability: 100 },
        { stage: 'lost', count: 5, totalValue: 70000, weightedValue: 0, averageProbability: 0 },
      ],
      totals: { count: 45, totalValue: 796000, weightedValue: 481000 },
    },
  },
};

/* ----------------------------------------------------------------------------
 * Request bodies
 * ------------------------------------------------------------------------- */

const requests = {
  register: { name: 'Asha Verma', email: 'asha@crm.dev', phone: '+919876543210', password: 'Passw0rd!' },
  login: { email: 'admin@crm.dev', password: 'Admin@12345' },
  createUser: { name: 'Vikram Rao', email: 'vikram@crm.dev', phone: '+919811112222', password: 'Passw0rd!', role: 'sales_executive', manager: '6650f1c2a8b4c2e3d4f5a6b7' },
  createLead: {
    name: 'Rahul Mehta',
    email: 'rahul@acme.io',
    phone: '+919800000001',
    company: 'Acme Corp',
    source: 'website',
    priority: 'high',
    description: 'Requested a demo of the enterprise plan',
    assignedTo: '6650f1c2a8b4c2e3d4f5a6b7',
  },
  convertLead: {
    customer: { address: { city: 'Bengaluru', country: 'India' } },
    deal: { name: 'Acme - Enterprise plan', value: 48000, expectedCloseDate: '2026-12-31', stage: 'discovery' },
  },
  createDeal: { name: 'Acme - Add-on seats', customer: '6650f1c2a8b4c2e3d4f5a6b7', value: 12000, expectedCloseDate: '2026-12-15', stage: 'proposal' },
  changeStageWon: { stage: 'won', finalValue: 47000 },
  changeStageLost: { stage: 'lost', lostReason: 'Chose a competitor on price' },
  createActivity: { type: 'follow_up', title: 'Follow up on proposal', dueDate: '2026-11-05T10:00:00.000Z', relatedType: 'deal', relatedId: '6650f1c2a8b4c2e3d4f5a6b7' },
};

const leadCreateSchema = {
  type: 'object',
  required: ['name'],
  description: 'Either `email` or `phone` is required. Executives are auto-assigned the lead they create.',
  properties: {
    name: { type: 'string', minLength: 2, maxLength: 120 },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string', example: '+919800000001' },
    company: { type: 'string' },
    source: enumOf(LEAD_SOURCES, { default: 'other' }),
    priority: enumOf(PRIORITIES, { default: 'medium' }),
    description: { type: 'string', maxLength: 2000 },
    assignedTo: { ...objectId, description: 'Active sales executive (admins: any; managers: own team; executives: self)' },
  },
};

const dealCoreProperties = {
  name: { type: 'string', minLength: 2, maxLength: 150 },
  value: { type: 'number', exclusiveMinimum: 0 },
  currency: { type: 'string', minLength: 3, maxLength: 3 },
  probability: { type: 'number', minimum: 0, maximum: 100, description: 'Defaults to the configured probability of the stage' },
  expectedCloseDate: { type: 'string', format: 'date', description: 'Today or later, within the configured horizon (maxDealCloseDays)' },
  description: { type: 'string' },
};

/* ----------------------------------------------------------------------------
 * Paths
 * ------------------------------------------------------------------------- */

const idParam = param('id');
const timelineParams = [idParam, ...PAGINATION_PARAMS, listQuery('action', Object.values(TIMELINE_ACTIONS), 'Filter by action.'), ...CREATED_RANGE];

const paths = {
  /* ------------------------------ Auth ------------------------------ */
  '/auth/register': {
    post: op('Auth', 'Register (self sign-up as sales_executive)', {
      description: 'Public sign-up. The role is always `sales_executive`; admins assign other roles. Disabled when `ALLOW_PUBLIC_REGISTRATION=false`. Sets the `crm_refresh_token` httpOnly cookie.',
      security: [],
      requestBody: body(
        {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            password: { type: 'string', description: 'Min 8 chars with upper, lower case letters and a number' },
          },
        },
        requests.register,
      ),
      responses: { ...success('Registration successful', ref('AuthSession'), { status: 201 }), ...errors(400, 403, 409, 429) },
    }),
  },
  '/auth/login': {
    post: op('Auth', 'Log in', {
      description:
        'Returns a short-lived JWT access token in the body and sets a rotating refresh token in the `crm_refresh_token` httpOnly cookie. Accounts lock for 15 minutes after 5 failed attempts.',
      security: [],
      requestBody: body(
        { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } },
        requests.login,
      ),
      responses: { ...success('Login successful', ref('AuthSession')), ...errors(400, 401, 403, 423, 429) },
    }),
  },
  '/auth/refresh': {
    post: op('Auth', 'Refresh the access token', {
      description:
        'Uses the `crm_refresh_token` cookie. The refresh token is rotated on every call; re-using an old token revokes the whole session family (theft detection).',
      security: [{ refreshCookie: [] }],
      responses: { ...success('Token refreshed successfully', ref('AuthSession')), ...errors(401, 429) },
    }),
  },
  '/auth/logout': {
    post: op('Auth', 'Log out (current session)', {
      description: 'Revokes the refresh token from the cookie and clears it. Idempotent.',
      security: [],
      responses: success('Logged out successfully', { nullable: true }),
    }),
  },
  '/auth/logout-all': {
    post: op('Auth', 'Log out from all devices', {
      description: 'Revokes every refresh token and invalidates all issued access tokens.',
      responses: { ...success('Logged out from all devices', { nullable: true }), ...errors(401) },
    }),
  },
  '/auth/me': {
    get: op('Auth', 'Current user profile', { roles: 'any authenticated user', responses: { ...success('Profile fetched successfully', ref('User')), ...errors(401) } }),
    patch: op('Auth', 'Update own profile', {
      roles: 'any authenticated user',
      requestBody: body({ type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string', nullable: true } } }, { name: 'Asha V.', phone: '+919800000099' }),
      responses: { ...success('Profile updated successfully', ref('User')), ...errors(400, 401) },
    }),
  },
  '/auth/me/password': {
    patch: op('Auth', 'Change own password', {
      description: 'Signs out all other sessions and returns a fresh session for the caller.',
      requestBody: body(
        { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } },
        { currentPassword: 'Passw0rd!', newPassword: 'N3wPassw0rd!' },
      ),
      responses: { ...success('Password changed successfully', ref('AuthSession')), ...errors(400, 401, 429) },
    }),
  },

  /* ------------------------------ Users ------------------------------ */
  '/users': {
    get: op('Users', 'List users', {
      roles: 'admin (all users), sales_manager (self + own team)',
      params: [
        ...PAGINATION_PARAMS,
        sortQuery(['createdAt', 'updatedAt', 'name', 'email', 'role', 'lastLoginAt']),
        param('search'),
        listQuery('role', Object.values(ROLES), 'Filter by role.'),
        query('isActive', { type: 'boolean' }, 'Filter by active status'),
        query('manager', objectId, 'Executives reporting to this manager'),
        ...CREATED_RANGE,
      ],
      responses: { ...success('Users fetched successfully', arrayOf(ref('User')), { paginated: true }), ...errors(400, 401, 403) },
    }),
    post: op('Users', 'Create user', {
      roles: 'admin',
      requestBody: body(
        {
          type: 'object',
          required: ['name', 'email', 'password', 'role'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            password: { type: 'string' },
            role: enumOf(Object.values(ROLES)),
            manager: { ...objectId, description: 'Only for sales_executive: an active sales_manager', nullable: true },
            isActive: { type: 'boolean', default: true },
          },
        },
        requests.createUser,
      ),
      responses: { ...success('User created successfully', ref('User'), { status: 201 }), ...errors(400, 401, 403, 409, 422) },
    }),
  },
  '/users/{id}': {
    get: op('Users', 'Get user by ID', { roles: 'admin, sales_manager (self + team)', params: [idParam], responses: { ...success('User fetched successfully', ref('User')), ...errors(400, 401, 403, 404) } }),
    patch: op('Users', 'Update user', {
      roles: 'admin',
      description: 'Changing role or resetting the password revokes the user\'s sessions. A manager with team members cannot change role.',
      params: [idParam],
      requestBody: body(
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string', nullable: true },
            role: enumOf(Object.values(ROLES)),
            manager: { ...objectId, nullable: true },
            password: { type: 'string' },
          },
        },
        { role: 'sales_manager', manager: null },
      ),
      responses: { ...success('User updated successfully', ref('User')), ...errors(400, 401, 403, 404, 409, 422) },
    }),
    delete: op('Users', 'Delete user', {
      roles: 'admin',
      description: 'Only users without CRM records or team members can be deleted; otherwise deactivate them.',
      params: [idParam],
      responses: { ...success('User deleted successfully', { nullable: true }), ...errors(401, 403, 404, 409, 422) },
    }),
  },
  '/users/{id}/status': {
    patch: op('Users', 'Activate / deactivate user', {
      roles: 'admin',
      description: 'Deactivation immediately revokes all sessions of the user. Inactive users cannot log in or be assigned records.',
      params: [idParam],
      requestBody: body({ type: 'object', required: ['isActive'], properties: { isActive: { type: 'boolean' } } }, { isActive: false }),
      responses: { ...success('User deactivated successfully', ref('User')), ...errors(400, 401, 403, 404, 409, 422) },
    }),
  },

  /* ------------------------------ Leads ------------------------------ */
  '/leads': {
    get: op('Leads', 'List leads', {
      roles: ALL,
      description: 'All filters can be combined. Executives only see leads assigned to them; managers see their team\'s leads.',
      params: [
        ...PAGINATION_PARAMS,
        sortQuery(['createdAt', 'updatedAt', 'name', 'company', 'status', 'priority', 'source']),
        param('search'),
        listQuery('status', Object.values(LEAD_STATUS), 'Filter by status.'),
        listQuery('priority', PRIORITIES, 'Filter by priority.'),
        listQuery('source', LEAD_SOURCES, 'Filter by source.'),
        query('assignedTo', { type: 'string', description: 'User ID or `unassigned`' }, 'Filter by assignee'),
        query('createdBy', objectId, 'Filter by creator'),
        ...CREATED_RANGE,
        query('updatedFrom', { type: 'string', format: 'date' }),
        query('updatedTo', { type: 'string', format: 'date' }),
      ],
      responses: { ...success('Leads fetched successfully', arrayOf(ref('Lead')), { paginated: true }), ...errors(400, 401) },
    }),
    post: op('Leads', 'Create lead', {
      roles: ALL,
      requestBody: body(leadCreateSchema, requests.createLead),
      responses: { ...success('Lead created successfully', ref('Lead'), { status: 201 }), ...errors(400, 401, 403, 409, 422) },
    }),
  },
  '/leads/{id}': {
    get: op('Leads', 'Get lead by ID', { roles: ALL, params: [idParam], responses: { ...success('Lead fetched successfully', ref('Lead')), ...errors(400, 401, 404) } }),
    patch: op('Leads', 'Update lead', {
      roles: ALL,
      description: 'Status and assignment have dedicated endpoints. Converted leads are read-only. Priority changes are recorded as `lead_priority_changed`.',
      params: [idParam],
      requestBody: body(
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            company: { type: 'string', nullable: true },
            source: enumOf(LEAD_SOURCES),
            priority: enumOf(PRIORITIES),
            description: { type: 'string', nullable: true },
          },
        },
        { priority: 'high', company: 'Acme Corporation' },
      ),
      responses: { ...success('Lead updated successfully', ref('Lead')), ...errors(400, 401, 404, 409) },
    }),
    delete: op('Leads', 'Delete lead', {
      roles: ADMIN_MANAGER,
      description: 'Converted leads cannot be deleted. Activities linked to the lead are removed; the audit trail is kept.',
      params: [idParam],
      responses: { ...success('Lead deleted successfully', { nullable: true }), ...errors(401, 403, 404, 409) },
    }),
  },
  '/leads/{id}/status': {
    patch: op('Leads', 'Update lead status', {
      roles: ALL,
      description:
        'Allowed transitions: new → contacted|qualified|unqualified|lost; contacted → qualified|unqualified|lost; qualified → contacted|unqualified|lost; unqualified → contacted|lost; lost → contacted. `converted` is only reachable via /convert. `reason` is required for `lost`.',
      params: [idParam],
      requestBody: body(
        { type: 'object', required: ['status'], properties: { status: enumOf(Object.values(LEAD_STATUS).filter((s) => s !== 'converted')), reason: { type: 'string' } } },
        { status: 'qualified' },
      ),
      responses: { ...success('Lead status updated successfully', ref('Lead')), ...errors(400, 401, 404, 409, 422) },
    }),
  },
  '/leads/{id}/assign': {
    patch: op('Leads', 'Assign / reassign lead', {
      roles: ADMIN_MANAGER,
      description: 'Assignee must be an active sales executive (managers: within their team). Recorded as `lead_assigned` or `lead_reassigned`.',
      params: [idParam],
      requestBody: body({ type: 'object', required: ['assignedTo'], properties: { assignedTo: objectId, note: { type: 'string' } } }, { assignedTo: '6650f1c2a8b4c2e3d4f5a6b7', note: 'Territory realignment' }),
      responses: { ...success('Lead assigned successfully', ref('Lead')), ...errors(400, 401, 403, 404, 409, 422) },
    }),
  },
  '/leads/{id}/convert': {
    post: op('Leads', 'Convert lead to customer (+ optional deal)', {
      roles: ALL,
      description:
        'Only `qualified`, assigned leads can be converted, exactly once. Runs in a MongoDB transaction: lead status, customer, deal, back-references and timeline entries are committed atomically. Customer fields default to the lead\'s data.',
      params: [idParam],
      requestBody: body(
        {
          type: 'object',
          properties: {
            customer: {
              type: 'object',
              properties: { name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, company: { type: 'string' }, address, description: { type: 'string' } },
            },
            deal: {
              type: 'object',
              required: ['name', 'value', 'expectedCloseDate'],
              properties: { ...dealCoreProperties, stage: enumOf(OPEN_DEAL_STAGES, { default: 'qualification' }) },
            },
          },
        },
        requests.convertLead,
      ),
      responses: {
        ...success(
          'Lead converted successfully',
          { type: 'object', properties: { lead: ref('Lead'), customer: ref('Customer'), deal: { nullable: true, allOf: [ref('Deal')] } } },
          { status: 201 },
        ),
        ...errors(400, 401, 404, 409, 422),
      },
    }),
  },
  '/leads/{id}/timeline': {
    get: op('Leads', 'Lead timeline', {
      roles: ALL,
      description: 'Includes events of the customer and deal created from this lead.',
      params: timelineParams,
      responses: { ...success('Lead timeline fetched successfully', arrayOf(ref('TimelineEvent')), { paginated: true }), ...errors(400, 401, 404) },
    }),
  },

  /* ------------------------------ Customers ------------------------------ */
  '/customers': {
    get: op('Customers', 'List customers', {
      roles: ALL,
      params: [
        ...PAGINATION_PARAMS,
        sortQuery(['createdAt', 'updatedAt', 'name', 'company', 'status']),
        param('search'),
        listQuery('status', CUSTOMER_STATUSES, 'Filter by status.'),
        query('assignedTo', objectId),
        query('lead', objectId, 'Customer created from this lead'),
        query('fromLead', { type: 'boolean' }, 'true = only converted customers, false = only directly created'),
        ...CREATED_RANGE,
      ],
      responses: { ...success('Customers fetched successfully', arrayOf(ref('Customer')), { paginated: true }), ...errors(400, 401) },
    }),
    post: op('Customers', 'Create customer', {
      roles: ALL,
      description: 'Either email or phone is required. Executives own the customers they create; admins must pass `assignedTo`.',
      requestBody: body(
        {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            company: { type: 'string' },
            address,
            description: { type: 'string' },
            status: enumOf(CUSTOMER_STATUSES, { default: 'active' }),
            assignedTo: objectId,
          },
        },
        { name: 'Globex Ltd', email: 'ops@globex.com', company: 'Globex', address: { city: 'Pune', country: 'India' } },
      ),
      responses: { ...success('Customer created successfully', ref('Customer'), { status: 201 }), ...errors(400, 401, 403, 409, 422) },
    }),
  },
  '/customers/{id}': {
    get: op('Customers', 'Get customer by ID', {
      roles: ALL,
      description: 'Includes the original lead and associated deals.',
      params: [idParam],
      responses: { ...success('Customer fetched successfully', ref('Customer')), ...errors(400, 401, 404) },
    }),
    patch: op('Customers', 'Update customer', {
      roles: ALL,
      params: [idParam],
      requestBody: body(
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            company: { type: 'string', nullable: true },
            address: { ...address, nullable: true },
            description: { type: 'string', nullable: true },
            status: enumOf(CUSTOMER_STATUSES),
          },
        },
        { status: 'inactive' },
      ),
      responses: { ...success('Customer updated successfully', ref('Customer')), ...errors(400, 401, 404, 409) },
    }),
    delete: op('Customers', 'Delete customer', {
      roles: ADMIN_MANAGER,
      description: 'Customers created from a lead conversion or with deals cannot be deleted (set status instead).',
      params: [idParam],
      responses: { ...success('Customer deleted successfully', { nullable: true }), ...errors(401, 403, 404, 409) },
    }),
  },
  '/customers/{id}/assign': {
    patch: op('Customers', 'Assign / reassign customer', {
      roles: ADMIN_MANAGER,
      params: [idParam],
      requestBody: body({ type: 'object', required: ['assignedTo'], properties: { assignedTo: objectId } }),
      responses: { ...success('Customer assigned successfully', ref('Customer')), ...errors(400, 401, 403, 404, 422) },
    }),
  },
  '/customers/{id}/timeline': {
    get: op('Customers', 'Customer timeline', {
      roles: ALL,
      description: 'Includes events of the customer\'s deals.',
      params: timelineParams,
      responses: { ...success('Customer timeline fetched successfully', arrayOf(ref('TimelineEvent')), { paginated: true }), ...errors(400, 401, 404) },
    }),
  },

  /* ------------------------------ Deals ------------------------------ */
  '/deals': {
    get: op('Deals', 'List deals', {
      roles: ALL,
      params: [
        ...PAGINATION_PARAMS,
        sortQuery(['createdAt', 'updatedAt', 'name', 'value', 'probability', 'expectedRevenue', 'expectedCloseDate', 'stage', 'closedAt']),
        param('search'),
        listQuery('stage', DEAL_STAGES, 'Filter by stage.'),
        listQuery('status', DEAL_STATUSES, 'Filter by status.'),
        query('assignedTo', objectId),
        query('customer', objectId),
        query('lead', objectId),
        query('minAmount', { type: 'number' }, 'Minimum deal value'),
        query('maxAmount', { type: 'number' }, 'Maximum deal value'),
        query('closeDateFrom', { type: 'string', format: 'date' }, 'Expected close date from'),
        query('closeDateTo', { type: 'string', format: 'date' }, 'Expected close date to (inclusive)'),
        ...CREATED_RANGE,
      ],
      responses: { ...success('Deals fetched successfully', arrayOf(ref('Deal')), { paginated: true }), ...errors(400, 401) },
    }),
    post: op('Deals', 'Create deal', {
      roles: ALL,
      description: 'The lead reference is taken from the customer. `expectedRevenue` is computed by the server.',
      requestBody: body(
        {
          type: 'object',
          required: ['name', 'customer', 'value', 'expectedCloseDate'],
          properties: { ...dealCoreProperties, customer: objectId, stage: enumOf(OPEN_DEAL_STAGES, { default: 'qualification' }), assignedTo: objectId },
        },
        requests.createDeal,
      ),
      responses: { ...success('Deal created successfully', ref('Deal'), { status: 201 }), ...errors(400, 401, 403, 404, 422) },
    }),
  },
  '/deals/{id}': {
    get: op('Deals', 'Get deal by ID', { roles: ALL, params: [idParam], responses: { ...success('Deal fetched successfully', ref('Deal')), ...errors(400, 401, 404) } }),
    patch: op('Deals', 'Update deal', {
      roles: ALL,
      description: 'Stage changes use /stage. Closed deals only allow `description` changes.',
      params: [idParam],
      requestBody: body({ type: 'object', properties: dealCoreProperties }, { value: 52000, probability: 60 }),
      responses: { ...success('Deal updated successfully', ref('Deal')), ...errors(400, 401, 404, 422) },
    }),
    delete: op('Deals', 'Delete deal', {
      roles: `${ADMIN_MANAGER}; won deals: admin only`,
      params: [idParam],
      responses: { ...success('Deal deleted successfully', { nullable: true }), ...errors(401, 403, 404) },
    }),
  },
  '/deals/{id}/stage': {
    patch: op('Deals', 'Change deal stage', {
      roles: ALL,
      description: [
        '- Open stages can move freely between each other; probability defaults to the configured stage probability.',
        '- `won`: value must be > 0, linked customer must exist, owner must be active; probability = 100. Optional `finalValue`.',
        '- `lost`: `lostReason` required; probability = 0.',
        '- Closed → open: only admin/manager with `reopenReason`. Won ↔ Lost directly is not allowed.',
      ].join('\n'),
      params: [idParam],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['stage'],
              properties: {
                stage: enumOf(DEAL_STAGES),
                probability: { type: 'number', minimum: 0, maximum: 100 },
                lostReason: { type: 'string' },
                reopenReason: { type: 'string' },
                finalValue: { type: 'number', exclusiveMinimum: 0 },
              },
            },
            examples: {
              advance: { value: { stage: 'negotiation' } },
              won: { value: requests.changeStageWon },
              lost: { value: requests.changeStageLost },
              reopen: { value: { stage: 'negotiation', reopenReason: 'Customer came back with a revised budget' } },
            },
          },
        },
      },
      responses: { ...success('Deal moved to won', ref('Deal')), ...errors(400, 401, 403, 404, 422) },
    }),
  },
  '/deals/{id}/assign': {
    patch: op('Deals', 'Assign / reassign deal', {
      roles: ADMIN_MANAGER,
      params: [idParam],
      requestBody: body({ type: 'object', required: ['assignedTo'], properties: { assignedTo: objectId } }),
      responses: { ...success('Deal assigned successfully', ref('Deal')), ...errors(400, 401, 403, 404, 422) },
    }),
  },
  '/deals/{id}/timeline': {
    get: op('Deals', 'Deal timeline', {
      roles: ALL,
      params: timelineParams,
      responses: { ...success('Deal timeline fetched successfully', arrayOf(ref('TimelineEvent')), { paginated: true }), ...errors(400, 401, 404) },
    }),
  },

  /* ------------------------------ Activities ------------------------------ */
  '/activities': {
    get: op('Activities', 'List activities', {
      roles: ALL,
      description:
        'Visible: activities assigned to or created by the user (managers: their team). When `relatedType` + `relatedId` point to an accessible lead/customer/deal, its full activity history is returned. `status=overdue` returns pending activities whose due date has passed.',
      params: [
        ...PAGINATION_PARAMS,
        sortQuery(['dueDate', 'createdAt', 'updatedAt', 'completedAt', 'title', 'type'], 'dueDate'),
        param('search'),
        listQuery('type', ACTIVITY_TYPES, 'Filter by type.'),
        listQuery('status', Object.values(ACTIVITY_STATUS), 'Filter by status.'),
        query('assignedTo', objectId),
        query('createdBy', objectId),
        query('relatedType', enumOf(ACTIVITY_RELATED_TYPES)),
        query('relatedId', objectId),
        query('dueFrom', { type: 'string', format: 'date' }),
        query('dueTo', { type: 'string', format: 'date' }),
        ...CREATED_RANGE,
      ],
      responses: { ...success('Activities fetched successfully', arrayOf(ref('Activity')), { paginated: true }), ...errors(400, 401, 404) },
    }),
    post: op('Activities', 'Create activity / note / follow-up', {
      roles: ALL,
      description: '`dueDate` is required (and must not be in the past) for every type except `note`. Notes are stored as completed.',
      requestBody: body(
        {
          type: 'object',
          required: ['type', 'title'],
          properties: {
            type: enumOf(ACTIVITY_TYPES),
            title: { type: 'string' },
            description: { type: 'string' },
            dueDate: dateTime,
            assignedTo: objectId,
            relatedType: enumOf(ACTIVITY_RELATED_TYPES),
            relatedId: objectId,
          },
        },
        requests.createActivity,
      ),
      responses: { ...success('Activity created successfully', ref('Activity'), { status: 201 }), ...errors(400, 401, 403, 404, 422) },
    }),
  },
  '/activities/{id}': {
    get: op('Activities', 'Get activity by ID', { roles: ALL, params: [idParam], responses: { ...success('Activity fetched successfully', ref('Activity')), ...errors(400, 401, 404) } }),
    patch: op('Activities', 'Update activity', {
      roles: ALL,
      description: 'Completed activities cannot be modified.',
      params: [idParam],
      requestBody: body(
        { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string', nullable: true }, dueDate: dateTime, assignedTo: objectId } },
        { dueDate: '2026-11-10T09:00:00.000Z' },
      ),
      responses: { ...success('Activity updated successfully', ref('Activity')), ...errors(400, 401, 403, 404, 422) },
    }),
    delete: op('Activities', 'Delete activity', {
      roles: 'creator (executives), admin, sales_manager (team)',
      params: [idParam],
      responses: { ...success('Activity deleted successfully', { nullable: true }), ...errors(401, 403, 404) },
    }),
  },
  '/activities/{id}/complete': {
    patch: op('Activities', 'Mark activity as completed', {
      roles: ALL,
      params: [idParam],
      requestBody: body({ type: 'object', properties: { outcome: { type: 'string' } } }, { outcome: 'Customer confirmed budget approval' }),
      responses: { ...success('Activity marked as completed', ref('Activity')), ...errors(400, 401, 403, 404, 409) },
    }),
  },

  /* ------------------------------ Dashboard ------------------------------ */
  '/dashboard/summary': {
    get: op('Dashboard', 'Sales KPIs', {
      roles: `${ALL} — admins: company, managers: team, executives: self`,
      params: [...CREATED_RANGE, query('assignedTo', objectId)],
      responses: { ...success('Dashboard summary fetched successfully', ref('DashboardSummary')), ...errors(400, 401) },
    }),
  },
  '/dashboard/pipeline': {
    get: op('Dashboard', 'Sales pipeline by stage', {
      roles: ALL,
      params: [...CREATED_RANGE, query('assignedTo', objectId)],
      responses: { ...success('Sales pipeline fetched successfully', ref('Pipeline')), ...errors(400, 401) },
    }),
  },
  '/dashboard/team-performance': {
    get: op('Dashboard', 'Team performance per sales executive', {
      roles: 'admin (all executives or one team via `manager`), sales_manager (own team)',
      params: [...CREATED_RANGE, query('manager', objectId, 'Admins: limit to one manager\'s team')],
      responses: { ...success('Team performance fetched successfully', { type: 'object' }), ...errors(400, 401, 403) },
    }),
  },
  '/dashboard/revenue-trend': {
    get: op('Dashboard', 'Monthly closed-won revenue', {
      roles: ADMIN_MANAGER,
      params: [query('months', { type: 'integer', minimum: 1, maximum: 24, default: 6 }), query('assignedTo', objectId)],
      responses: { ...success('Revenue trend fetched successfully', { type: 'object' }), ...errors(400, 401, 403) },
    }),
  },

  /* ------------------------------ Admin ------------------------------ */
  '/config': {
    get: op('Configuration', 'Get CRM configuration', { roles: 'any authenticated user', responses: { ...success('CRM configuration fetched successfully', ref('Config')), ...errors(401) } }),
    patch: op('Configuration', 'Update CRM configuration', {
      roles: 'admin',
      requestBody: body(
        {
          type: 'object',
          properties: {
            defaultCurrency: { type: 'string' },
            maxDealCloseDays: { type: 'integer', minimum: 1, maximum: 3650 },
            stageProbabilities: { type: 'object', properties: Object.fromEntries(OPEN_DEAL_STAGES.map((s) => [s, { type: 'number', minimum: 0, maximum: 100 }])) },
          },
        },
        { stageProbabilities: { proposal: 55 }, maxDealCloseDays: 365 },
      ),
      responses: { ...success('CRM configuration updated successfully', ref('Config')), ...errors(400, 401, 403) },
    }),
  },
  '/timeline': {
    get: op('Configuration', 'Global audit log', {
      roles: 'admin',
      params: [
        ...PAGINATION_PARAMS,
        listQuery('action', Object.values(TIMELINE_ACTIONS), 'Filter by action.'),
        query('entityType', enumOf(ENTITY_TYPES)),
        query('entityId', objectId),
        query('performedBy', objectId),
        ...CREATED_RANGE,
      ],
      responses: { ...success('Audit log fetched successfully', arrayOf(ref('TimelineEvent')), { paginated: true }), ...errors(400, 401, 403) },
    }),
  },
};

/* ----------------------------------------------------------------------------
 * Document
 * ------------------------------------------------------------------------- */

const errorResponse = (description, example) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorResponse'), example: { success: false, ...example, requestId: '3f0c9b2e-5a8d-4a43-9d0c-1b2a3c4d5e6f' } } },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'CRM Sales Management API',
    version: '1.0.0',
    description: [
      'REST API for managing the sales process: **lead → qualification → customer → deal → closure**.',
      '',
      '### Authentication',
      '1. `POST /auth/login` returns an `accessToken` (JWT, 15 min) and sets an httpOnly `crm_refresh_token` cookie (7 days, rotated on every refresh).',
      '2. Send `Authorization: Bearer <accessToken>` on every protected request.',
      '3. When the access token expires (`401 TOKEN_EXPIRED`), call `POST /auth/refresh`.',
      '',
      '### Response format',
      'Success: `{ "success": true, "message": "...", "data": ..., "meta": { "pagination": {...} } }`  ',
      'Error: `{ "success": false, "message": "...", "code": "...", "errors": [...], "requestId": "..." }`',
      '',
      '### Record-level access',
      'Records outside the caller\'s scope return **404** (not 403) so their existence is not disclosed.',
    ].join('\n'),
  },
  servers: [{ url: env.API_PREFIX, description: 'Current server' }],
  tags: [
    { name: 'Auth', description: 'Registration, login, token refresh, logout, profile' },
    { name: 'Users', description: 'User management (admin) and team listing (manager)' },
    { name: 'Leads', description: 'Lead lifecycle, assignment and conversion' },
    { name: 'Customers', description: 'Customer management' },
    { name: 'Deals', description: 'Deal pipeline and stage rules' },
    { name: 'Activities', description: 'Calls, meetings, follow-ups, notes' },
    { name: 'Dashboard', description: 'Sales analytics' },
    { name: 'Configuration', description: 'CRM configuration and audit log (admin)' },
  ],
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'crm_refresh_token' },
    },
    parameters: {
      id: { in: 'path', name: 'id', required: true, schema: objectId, description: 'MongoDB ObjectId' },
      page: { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
      limit: { in: 'query', name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
      search: { in: 'query', name: 'search', schema: { type: 'string', maxLength: 100 }, description: 'Case-insensitive keyword search' },
      createdFrom: { in: 'query', name: 'createdFrom', schema: { type: 'string', format: 'date' }, description: 'Created on/after (ISO date or date-time)' },
      createdTo: { in: 'query', name: 'createdTo', schema: { type: 'string', format: 'date' }, description: 'Created on/before; a bare date includes the whole day' },
    },
    responses: {
      BadRequest: errorResponse('Invalid request / validation error', {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'email', message: 'Invalid email format' }],
      }),
      Unauthorized: errorResponse('Missing, invalid or expired credentials', { message: 'Access token has expired', code: 'TOKEN_EXPIRED' }),
      Forbidden: errorResponse('Authenticated but not allowed', { message: 'Your role is not permitted to perform this action', code: 'FORBIDDEN' }),
      NotFound: errorResponse('Resource not found or outside your scope', { message: 'Lead not found', code: 'NOT_FOUND' }),
      Conflict: errorResponse('Duplicate data or conflicting state', { message: 'Lead has already been converted', code: 'CONFLICT' }),
      BusinessRule: errorResponse('Business rule violation', { message: 'Invalid status transition from "new" to "converted"', code: 'BUSINESS_RULE_VIOLATION' }),
      Locked: errorResponse('Account temporarily locked', { message: 'Account temporarily locked due to too many failed login attempts. Try again later.', code: 'ACCOUNT_LOCKED' }),
      TooManyRequests: errorResponse('Rate limit exceeded', { message: 'Too many requests, please try again later.', code: 'TOO_MANY_REQUESTS' }),
    },
    schemas,
  },
};
