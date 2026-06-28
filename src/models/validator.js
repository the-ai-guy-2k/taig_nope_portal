'use strict';

const { SCHEMAS } = require('./schemas');

function isIsoDateString(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function validateObject(obj, schemaName, path = schemaName) {
  const errors = [];
  const schema = SCHEMAS[schemaName];

  if (!schema) {
    return [`Unknown schema: ${schemaName}`];
  }

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return [`${path} must be an object`];
  }

  for (const field of schema.required) {
    if (!(field in obj)) {
      errors.push(`${path}.${field} is required`);
    }
  }

  if (schema.enums) {
    for (const [field, allowed] of Object.entries(schema.enums)) {
      if (field in obj && !allowed.includes(obj[field])) {
        errors.push(`${path}.${field} must be one of: ${allowed.join(', ')}`);
      }
    }
  }

  if (schema.arrays) {
    for (const field of schema.arrays) {
      if (field in obj && !Array.isArray(obj[field])) {
        errors.push(`${path}.${field} must be an array`);
      }
    }
  }

  if (schema.arrayItems) {
    for (const [field, itemSchema] of Object.entries(schema.arrayItems)) {
      if (field in obj && Array.isArray(obj[field])) {
        obj[field].forEach((item, index) => {
          errors.push(...validateObject(item, itemSchema, `${path}.${field}[${index}]`));
        });
      }
    }
  }

  if (schema.nested) {
    for (const [field, nestedSchema] of Object.entries(schema.nested)) {
      if (field in obj && obj[field] !== null) {
        errors.push(...validateObject(obj[field], nestedSchema, `${path}.${field}`));
      }
    }
  }

  if (schema.nullable) {
    for (const field of schema.nullable) {
      if (!(field in obj)) {
        continue;
      }
      if (obj[field] === null) {
        continue;
      }
      if (field.startsWith('minority_report') && typeof obj[field] !== 'string') {
        errors.push(`${path}.${field} must be a string id or null`);
      }
    }
  }

  const dateFields = ['created_at', 'updated_at', 'recorded_at', 'handed_off_at', 'completed_at'];
  for (const field of dateFields) {
    if (field in obj && obj[field] !== null && !isIsoDateString(obj[field])) {
      errors.push(`${path}.${field} must be a valid ISO date string`);
    }
  }

  if ('human_summary' in obj && obj.human_summary?.updated_at && !isIsoDateString(obj.human_summary.updated_at)) {
    errors.push(`${path}.human_summary.updated_at must be a valid ISO date string`);
  }

  return errors;
}

function validateCollection(items, schemaName, label) {
  const errors = [];

  if (!Array.isArray(items)) {
    return [`${label} must be an array`];
  }

  items.forEach((item, index) => {
    errors.push(...validateObject(item, schemaName, `${label}[${index}]`));
  });

  return errors;
}

function validateUniqueIds(items, idField, label) {
  const errors = [];
  const seen = new Set();

  for (const item of items) {
    const id = item[idField];
    if (seen.has(id)) {
      errors.push(`Duplicate ${idField} "${id}" in ${label}`);
    }
    seen.add(id);
  }

  return errors;
}

function validateJobOrderReferences(jobOrder, collections) {
  const errors = [];
  const { id: jobOrderId } = jobOrder;

  const minorityIds = new Set(collections.minority_reports.map((r) => r.id));
  const actionIds = new Set(collections.operator_actions.map((a) => a.id));
  const aciIds = new Set(collections.aci_history.map((a) => a.id));
  const reportIds = new Set(collections.completion_reports.map((r) => r.id));
  const timelineIds = new Set(collections.timeline.map((t) => t.id));

  if (jobOrder.minority_report_current && !minorityIds.has(jobOrder.minority_report_current)) {
    errors.push(`Job order ${jobOrderId}: minority_report_current references unknown id "${jobOrder.minority_report_current}"`);
  }

  if (jobOrder.minority_report_previous && !minorityIds.has(jobOrder.minority_report_previous)) {
    errors.push(`Job order ${jobOrderId}: minority_report_previous references unknown id "${jobOrder.minority_report_previous}"`);
  }

  for (const actionId of jobOrder.operator_actions) {
    if (!actionIds.has(actionId)) {
      errors.push(`Job order ${jobOrderId}: operator_actions references unknown id "${actionId}"`);
    }
  }

  for (const aciId of jobOrder.acis) {
    if (!aciIds.has(aciId)) {
      errors.push(`Job order ${jobOrderId}: acis references unknown id "${aciId}"`);
    }
  }

  for (const reportId of jobOrder.completion_reports) {
    if (!reportIds.has(reportId)) {
      errors.push(`Job order ${jobOrderId}: completion_reports references unknown id "${reportId}"`);
    }
  }

  for (const eventId of jobOrder.timeline) {
    if (!timelineIds.has(eventId)) {
      errors.push(`Job order ${jobOrderId}: timeline references unknown id "${eventId}"`);
    }
  }

  for (const action of collections.operator_actions) {
    if (action.job_order_id === jobOrderId && !jobOrder.operator_actions.includes(action.id)) {
      errors.push(`Operator action ${action.id} references job order ${jobOrderId} but is not linked on the job order`);
    }
  }

  for (const report of collections.minority_reports) {
    if (report.job_order_id === jobOrderId) {
      const linked =
        jobOrder.minority_report_current === report.id ||
        jobOrder.minority_report_previous === report.id;
      const isHistorical = ['superseded', 'archived', 'resolved'].includes(report.status);
      if (!linked && !isHistorical) {
        errors.push(`Minority report ${report.id} references job order ${jobOrderId} but is not linked on the job order`);
      }
    }
  }

  return errors;
}

module.exports = {
  validateObject,
  validateCollection,
  validateUniqueIds,
  validateJobOrderReferences,
  isIsoDateString,
};
