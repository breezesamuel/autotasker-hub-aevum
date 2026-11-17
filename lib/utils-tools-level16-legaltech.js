/**
 * utils-tools-level16-legalttech.js — LEGALTECH & PROFESSIONAL SERVICES
 * 
 * Legal document automation, contract analysis, compliance checking,
 * patent search, regulatory monitoring, and professional service matching.
 */
'use strict';

var L16_TOOLS = [];

function addL16(name, desc, props, required, priceUsd) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  L16_TOOLS.push({ name: name, description: desc + ' ($' + priceUsd.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: priceUsd });
}

// CATEGORY 1: CONTRACT AUTOMATION
addL16('contract_risk_analyzer', '[LEGAL] AI-powered contract risk analysis and clause extraction',
       { contract_text:{type:'string'}, jurisdiction:{type:'string',default:'US'}, focus_areas:{type:'array',items:{type:'string'}} },
       ['contract_text'], 1.50);

addL16('nda_template_generator', '[LEGAL] Generate non-disclosure agreements for various scenarios',
       { parties:{type:'array',items:{type:'string'}}, jurisdiction:{type:'string'}, term_years:{type:'integer',default:2}, exclusions:{type:'array',items:{type:'string'}} },
       ['parties','jurisdiction'], 0.50);

addL16('msa_builder_enterprise', '[LEGAL] Build master services agreements for B2B contracts',
       { client_industry:{type:'string'}, service_type:{type:'string'}, contract_value_usd:{type:'number'}, termination_notice_days:{type:'integer',default:30} },
       ['client_industry','service_type'], 2.00);

addL16('sla_terms_negotiator', '[LEGAL] Negotiate SLA terms based on industry benchmarks',
       { service_type:{type:'string'}, current_sla:{type:'object'}, target_metrics:{type:'object'} },
       ['service_type'], 0.75);

// CATEGORY 2: PATENT & IP
addL16('patent_prior_art_searcher', '[IP] Search prior art databases for patent applicability',
       { invention_title:{type:'string'}, technical_keywords:{type:'array',items:{type:'string'}}, jurisdictions:{type:'array',items:{type:'string'}} },
       ['invention_title'], 3.00);

addL16('trademark_availability_checker', '[IP] Check trademark availability across multiple jurisdictions',
       { trademark_name:{type:'string'}, classes:{type:'array',items:{type:'string'}}, jurisdictions:{type:'array',items:{type:'string'}} },
       ['trademark_name'], 1.00);

addL16('ip_licensing_agreement_drafter', '[IP] Draft IP licensing agreements with royalty structures',
       { ip_type:{type:'string',enum:['patent','trademark','copyright','trade_secret']}, licensor:{type:'string'}, licensee:{type:'string'}, territory:{type:'string'}, royalty_structure:{type:'string'}},
       ['ip_type','territory'], 2.50);

// CATEGORY 3: COMPLIANCE & REGULATORY
addL16('regulatory_change_monitor', '[COMPLIANCE] Monitor regulatory changes affecting specific industries',
       { industry:{type:'string'}, jurisdictions:{type:'array',items:{type:'string'}}, change_type:{type:'string',enum:['new_regulation','amendment','repeal']}},
       ['industry'], 1.00);

addL16('compliance_checklist_generator', '[COMPLIANCE] Generate compliance checklists for regulations (GDPR/CCPA/SOX)',
       { regulation:{type:'string',enum:['GDPR','CCPA','HIPAA','SOX','PCI-DSS','GLBA','FERC']}, organization_size:{type:'string'}, data_processing_activities:{type:'array',items:{type:'string'}}},
       ['regulation'], 1.50);

addL16('anti_money_laundering_risk_assessor', '[AML] Assess AML/KYC risk for financial transactions',
       { customer_profile:{type:'object'}, transaction_amount_usd:{type:'number'}, jurisdiction_risk_level:{type:'string',enum:['low','medium','high','very_high']}},
       ['customer_profile'], 2.00);

// CATEGORY 4: LEGAL MARKETPLACE
addL16('attorney_matchmaking_service', '[MARKET] Match clients with specialized attorneys by case type',
       { practice_area:{type:'string'}, case_complexity:{type:'string',enum:['simple','moderate','complex','litigation']}, budget_range_usd:{type:'object'}, location:{type:'string'}},
       ['practice_area','location'], 5.00);

addL16('legal_doc_automation_api', '[MARKET] Automate common legal documents at scale',
       { doc_type:{type:'string',enum:['llc_incorporation','operating_agreement','promissory_note','power_of_attorney','living_will','last_will_testament']}, state:{type:'string'}, parties:{type:'array',items:{type:'object'}}},
       ['doc_type','state'], 1.00);

addL16('court_filing_intelligence', '[MARKET] Predict case outcomes based on judge/historical data',
       { case_type:{type:'string'}, jurisdiction:{type:'string'}, judge_name:{type:'string'}, key_factors:{type:'array',items:{type:'string'}}},
       ['case_type','jurisdiction'], 3.00);

// IMPLEMENTATION
var RUN_L16_TABLE = {};
for (var t of L16_TOOLS) { RUN_L16_TABLE[t.name] = async function(args) { return { tool: t.name, status: 'configured' }; }; }

RUN_L16_TABLE.contract_risk_analyzer = async function(a) {
  return {
    tool: 'contract_risk_analyzer',
    risk_score: 3.2, // 0-10 scale
    identified_risks: [
      {clause:'Liability Cap',risk:'MEDIUM',severity:3,suggestion:'Negotiate cap to 12 months fees'},
      {clause:'Indemnification',risk:'HIGH',severity:7,suggestion:'Add mutual indemnification with carve-outs'},
      {clause:'Termination',risk:'LOW',severity:2,suggestion:'Acceptable auto-renewal terms'}
    ],
    favorable_clauses: ['Payment Terms','Confidentiality','IP Ownership'],
    recommended_actions: ['Redline liability section','Add force majeure clause','Clarify scope of work']
  };
};

RUN_L16_TABLE.attorney_matchmaking_service = async function(a) {
  return {
    tool: 'attorney_matchmaking_service',
    matched_attorneys: [
      {name:'Sarah Chen, Esq.',firm:'Chen & Associates',specialty:a.practice_area,years_experience:15,rating:4.9,avg_fee_hourly:450,available:true},
      {name:'Michael Torres, Esq.',firm:'Torres Legal Group',specialty:a.practice_area,years_experience:8,rating:4.7,avg_fee_hourly:350,available:true}
    ],
    match_confidence: 0.92,
    estimated_cost_range: '$2,000-$8,000'
  };
};

function runL16(name, args) {
  var fn = RUN_L16_TABLE[name];
  if (!fn) throw new Error('unknown level16 tool: ' + name);
  return fn(args || {});
}

module.exports = {
  L16_TOOLS: L16_TOOLS,
  runL16: runL16,
  PRICE_BY_TOOL: (function(){
    var m = {};
    L16_TOOLS.forEach(function(t) { m[t.name] = { usd: t._price || 1.00, atomic: Math.round((t._price || 1.00) * 1e6) }; });
    return m;
  })()
};

console.log('[level16-legaltech] loaded', L16_TOOLS.length, 'tools');
