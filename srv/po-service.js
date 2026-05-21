// srv/po-service.js
'use strict';

const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {

  // ── Connect to external S/4 service once at startup ───────────────────
const S4         = await cds.connect.to('S4ProductService');
const SupplierSvc = await cds.connect.to('SupplierValidationService');
const { ProductMaster }   = S4.entities;
const { SupplierRating }  = SupplierSvc.entities;

  // ── Load and register all handler modules ─────────────────────────────
require('./handlers/po-validations')(this, SupplierSvc, SupplierRating);
require('./handlers/po-enrichment')(this, S4, ProductMaster);
require('./handlers/po-actions')(this);
require('./handlers/po-calculations')(this);
require('./handlers/po-queries')(this, S4, ProductMaster, SupplierSvc, SupplierRating);

});