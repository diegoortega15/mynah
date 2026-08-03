// Reusable JSON Schemas for route validation. Besides rejecting bad input
// early, these feed the OpenAPI docs at /docs.

export const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer' } },
};

export const body = (required, properties) => ({
  type: 'object',
  required,
  properties,
  // Clients may send extra fields; ignore rather than reject.
  additionalProperties: true,
});
