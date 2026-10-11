const { z, nonEmptyBody } = require('./common');

const probability = z.number().min(0).max(100);

const updateConfig = {
  body: nonEmptyBody(
    z
      .object({
        defaultCurrency: z.string().trim().length(3).toUpperCase().optional(),
        maxDealCloseDays: z.number().int().min(1).max(3650).optional(),
        stageProbabilities: z
          .object({
            qualification: probability.optional(),
            discovery: probability.optional(),
            proposal: probability.optional(),
            negotiation: probability.optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  ),
};

module.exports = { updateConfig };
