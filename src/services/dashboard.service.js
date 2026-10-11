const { Lead, Customer, Deal, Activity, User } = require('../models');
const { ROLES, LEAD_STATUS, DEAL_STAGES, ACTIVITY_STATUS } = require('../constants');
const AppError = require('../utils/AppError');
const { buildRange, combineFilters, compact, toObjectId } = require('../utils/query');
const access = require('./access.service');

const round = (value, digits = 2) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;
const percentage = (part, whole) => (whole > 0 ? round((part / whole) * 100) : 0);

/** Aggregation expression: 1 if the pending activity's due date is in the past. */
const isOverdueExpr = (now) => ({
  $and: [{ $eq: [{ $type: '$dueDate' }, 'date'] }, { $lt: ['$dueDate', now] }],
});

async function scopes(actor, query) {
  const [leadScope, ownershipScope, activityScope] = await Promise.all([
    access.ownershipScope(actor, { includeUnassigned: true }),
    access.ownershipScope(actor),
    access.activityScope(actor),
  ]);

  // Aggregations do not cast types, so ids from the query string are converted explicitly.
  const assigned = query.assignedTo ? { assignedTo: toObjectId(query.assignedTo) } : null;
  const created = compact({ createdAt: buildRange(query.createdFrom, query.createdTo) });

  return {
    lead: combineFilters(leadScope, assigned, created),
    customer: combineFilters(ownershipScope, assigned, created),
    deal: combineFilters(ownershipScope, assigned, created),
    // Pending/overdue workload is "current state", so the created-date range is not applied.
    activity: combineFilters(activityScope, assigned),
  };
}

/**
 * Headline sales KPIs, scoped by role: admins see the company, managers their team,
 * executives themselves. All four collections are aggregated in parallel.
 */
async function getSummary(query, actor) {
  const now = new Date();
  const match = await scopes(actor, query);

  const [leadGroups, dealGroups, totalCustomers, activityGroups] = await Promise.all([
    Lead.aggregate([{ $match: match.lead }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Deal.aggregate([
      { $match: match.deal },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          value: { $sum: '$value' },
          expectedRevenue: { $sum: '$expectedRevenue' },
        },
      },
    ]),
    Customer.countDocuments(match.customer),
    Activity.aggregate([
      { $match: combineFilters(match.activity, { status: ACTIVITY_STATUS.PENDING }) },
      {
        $group: {
          _id: { $cond: [isOverdueExpr(now), ACTIVITY_STATUS.OVERDUE, ACTIVITY_STATUS.PENDING] },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const leadsByStatus = Object.fromEntries(Object.values(LEAD_STATUS).map((status) => [status, 0]));
  for (const group of leadGroups) leadsByStatus[group._id] = group.count;
  const totalLeads = Object.values(leadsByStatus).reduce((sum, count) => sum + count, 0);

  const deals = { open: {}, won: {}, lost: {} };
  for (const group of dealGroups) deals[group._id] = group;
  const count = (status) => deals[status].count || 0;

  const activities = Object.fromEntries(activityGroups.map((group) => [group._id, group.count]));

  return {
    leads: {
      total: totalLeads,
      new: leadsByStatus.new,
      contacted: leadsByStatus.contacted,
      qualified: leadsByStatus.qualified,
      unqualified: leadsByStatus.unqualified,
      converted: leadsByStatus.converted,
      lost: leadsByStatus.lost,
      conversionRate: percentage(leadsByStatus.converted, totalLeads),
    },
    customers: { total: totalCustomers },
    deals: {
      total: count('open') + count('won') + count('lost'),
      open: count('open'),
      won: count('won'),
      lost: count('lost'),
      winRate: percentage(count('won'), count('won') + count('lost')),
    },
    revenue: {
      // Closed-won value.
      totalRevenue: round(deals.won.value || 0),
      // Probability-weighted value of open deals.
      expectedRevenue: round(deals.open.expectedRevenue || 0),
      // Unweighted value of open deals.
      pipelineValue: round(deals.open.value || 0),
    },
    activities: {
      pending: activities.pending || 0,
      overdue: activities.overdue || 0,
    },
  };
}

/** Number and value of deals at each stage (every stage is always present, in funnel order). */
async function getPipeline(query, actor) {
  const match = await scopes(actor, query);

  const groups = await Deal.aggregate([
    { $match: match.deal },
    {
      $group: {
        _id: '$stage',
        count: { $sum: 1 },
        totalValue: { $sum: '$value' },
        weightedValue: { $sum: '$expectedRevenue' },
        averageProbability: { $avg: '$probability' },
      },
    },
  ]);

  const byStage = new Map(groups.map((group) => [group._id, group]));
  const stages = DEAL_STAGES.map((stage) => {
    const group = byStage.get(stage) || {};
    return {
      stage,
      count: group.count || 0,
      totalValue: round(group.totalValue || 0),
      weightedValue: round(group.weightedValue || 0),
      averageProbability: round(group.averageProbability || 0),
    };
  });

  return {
    stages,
    totals: {
      count: stages.reduce((sum, s) => sum + s.count, 0),
      totalValue: round(stages.reduce((sum, s) => sum + s.totalValue, 0)),
      weightedValue: round(stages.reduce((sum, s) => sum + s.weightedValue, 0)),
    },
  };
}

async function resolveTeam(query, actor) {
  if (actor.role === ROLES.SALES_MANAGER) {
    if (query.manager && String(query.manager) !== String(actor._id)) {
      throw AppError.forbidden('Managers can only view their own team performance');
    }
    return User.find({ manager: actor._id, role: ROLES.SALES_EXECUTIVE }).select('name email isActive manager').lean();
  }
  const filter = { role: ROLES.SALES_EXECUTIVE };
  if (query.manager) filter.manager = toObjectId(query.manager);
  return User.find(filter).select('name email isActive manager').lean();
}

/** Per-executive performance for a manager's team (or the whole company / one team for admins). */
async function getTeamPerformance(query, actor) {
  const now = new Date();
  const members = await resolveTeam(query, actor);
  const ids = members.map((member) => member._id);
  const created = compact({ createdAt: buildRange(query.createdFrom, query.createdTo) });
  const sumIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });
  const sumValueIf = (condition, field) => ({ $sum: { $cond: [condition, field, 0] } });

  const [leadStats, dealStats, activityStats] = await Promise.all([
    Lead.aggregate([
      { $match: { assignedTo: { $in: ids }, ...created } },
      {
        $group: {
          _id: '$assignedTo',
          total: { $sum: 1 },
          qualified: sumIf({ $eq: ['$status', LEAD_STATUS.QUALIFIED] }),
          converted: sumIf({ $eq: ['$status', LEAD_STATUS.CONVERTED] }),
          lost: sumIf({ $eq: ['$status', LEAD_STATUS.LOST] }),
        },
      },
    ]),
    Deal.aggregate([
      { $match: { assignedTo: { $in: ids }, ...created } },
      {
        $group: {
          _id: '$assignedTo',
          total: { $sum: 1 },
          open: sumIf({ $eq: ['$status', 'open'] }),
          won: sumIf({ $eq: ['$status', 'won'] }),
          lost: sumIf({ $eq: ['$status', 'lost'] }),
          revenue: sumValueIf({ $eq: ['$status', 'won'] }, '$value'),
          pipelineValue: sumValueIf({ $eq: ['$status', 'open'] }, '$value'),
          expectedRevenue: sumValueIf({ $eq: ['$status', 'open'] }, '$expectedRevenue'),
        },
      },
    ]),
    Activity.aggregate([
      { $match: { assignedTo: { $in: ids } } },
      {
        $group: {
          _id: '$assignedTo',
          completed: sumIf({ $eq: ['$status', ACTIVITY_STATUS.COMPLETED] }),
          overdue: sumIf({ $and: [{ $eq: ['$status', ACTIVITY_STATUS.PENDING] }, isOverdueExpr(now)] }),
          pending: sumIf({ $and: [{ $eq: ['$status', ACTIVITY_STATUS.PENDING] }, { $not: [isOverdueExpr(now)] }] }),
        },
      },
    ]),
  ]);

  const index = (rows) => new Map(rows.map((row) => [String(row._id), row]));
  const leadsBy = index(leadStats);
  const dealsBy = index(dealStats);
  const activitiesBy = index(activityStats);

  const performance = members.map((member) => {
    const key = String(member._id);
    const l = leadsBy.get(key) || {};
    const d = dealsBy.get(key) || {};
    const a = activitiesBy.get(key) || {};
    return {
      user: { _id: member._id, name: member.name, email: member.email, isActive: member.isActive },
      leads: {
        total: l.total || 0,
        qualified: l.qualified || 0,
        converted: l.converted || 0,
        lost: l.lost || 0,
        conversionRate: percentage(l.converted || 0, l.total || 0),
      },
      deals: {
        total: d.total || 0,
        open: d.open || 0,
        won: d.won || 0,
        lost: d.lost || 0,
        winRate: percentage(d.won || 0, (d.won || 0) + (d.lost || 0)),
      },
      revenue: {
        totalRevenue: round(d.revenue || 0),
        pipelineValue: round(d.pipelineValue || 0),
        expectedRevenue: round(d.expectedRevenue || 0),
      },
      activities: { pending: a.pending || 0, overdue: a.overdue || 0, completed: a.completed || 0 },
    };
  });

  performance.sort((a, b) => b.revenue.totalRevenue - a.revenue.totalRevenue);

  const sum = (pick) => performance.reduce((total, row) => total + pick(row), 0);
  const totalLeads = sum((r) => r.leads.total);
  const totalConverted = sum((r) => r.leads.converted);

  return {
    teamSize: members.length,
    totals: {
      leads: totalLeads,
      convertedLeads: totalConverted,
      conversionRate: percentage(totalConverted, totalLeads),
      dealsWon: sum((r) => r.deals.won),
      dealsLost: sum((r) => r.deals.lost),
      totalRevenue: round(sum((r) => r.revenue.totalRevenue)),
      expectedRevenue: round(sum((r) => r.revenue.expectedRevenue)),
      pendingActivities: sum((r) => r.activities.pending),
      overdueActivities: sum((r) => r.activities.overdue),
    },
    members: performance,
  };
}

/** Closed-won revenue per month for the last N months (missing months are zero-filled). */
async function getRevenueTrend(query, actor) {
  const scope = await access.ownershipScope(actor);
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (query.months - 1), 1));

  const match = combineFilters(
    scope,
    query.assignedTo ? { assignedTo: toObjectId(query.assignedTo) } : null,
    { status: 'won', closedAt: { $gte: start } },
  );

  const rows = await Deal.aggregate([
    { $match: match },
    {
      $group: {
        _id: { year: { $year: '$closedAt' }, month: { $month: '$closedAt' } },
        revenue: { $sum: '$value' },
        deals: { $sum: 1 },
      },
    },
  ]);

  const byMonth = new Map(rows.map((row) => [`${row._id.year}-${row._id.month}`, row]));
  const months = [];
  for (let i = 0; i < query.months; i += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const row = byMonth.get(`${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`) || {};
    months.push({
      month: date.toISOString().slice(0, 7),
      revenue: round(row.revenue || 0),
      deals: row.deals || 0,
    });
  }
  return { months, totalRevenue: round(months.reduce((total, m) => total + m.revenue, 0)) };
}

module.exports = { getSummary, getPipeline, getTeamPerformance, getRevenueTrend };
