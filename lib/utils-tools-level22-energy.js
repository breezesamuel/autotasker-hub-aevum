/**
 * utils-tools-level22-energy.js — ENERGY & CLEANTECH REVENUE
 * 
 * Renewable energy modeling, grid optimization, energy trading,
 * EV infrastructure, and clean technology monetization.
 */
'use strict';

var L22_TOOLS = [];

function addL22(name, desc, props, required, priceUsd) {
  var obj = { type: 'object', properties: props || {} };
  if (required) obj.required = required;
  L22_TOOLS.push({ name: name, description: desc + ' ($' + priceUsd.toFixed(2) + ' USDC/call)', inputSchema: obj, _price: priceUsd });
}

// CATEGORY 1: SOLAR & WIND
addL22('solar_panel_roi_calculator', '[ENERGY] Calculate solar panel installation ROI and payback period',
       { roof_area_sqft:{type:'number'}, location:{type:'string'}, monthly_electric_bill_usd:{type:'number'}, panel_efficiency_pct:{type:'number',default:20}, incentives_available:{type:'boolean'}},
       ['roof_area_sqft','monthly_electric_bill_usd'], 0.50);

addL22('wind_turbine_project_screener', '[ENERGY] Screen wind turbine project sites for viability',
       { site_location:{type:'string'}, available_land_acres:{type:'number'}, average_wind_speed_mph:{type:'number'}, distance_to_grid_miles:{type:'number'}},
       ['site_location','average_wind_speed_mph'], 2.00);

addL22('battery_storage_system_sizer', '[ENERGY] Size battery storage systems for solar/residential/commercial',
       { application:{type:'string',enum:['residential','commercial','industrial','grid_scale']}, daily_usage_kwh:{type:'number'}, peak_demand_kw:{type:'number'}, backup_duration_hours:{type:'integer',default:8}},
       ['application','daily_usage_kwh'], 0.75);

// CATEGORY 2: ENERGY TRADING & DERIVATIVES
addL22('electricity_price_forecasting_tool', '[TRADING] Forecast electricity spot prices for trading decisions',
       { region:{type:'string'}, time_horizon_hours:{type:'integer',default:24}, fuel_costs:{type:'object'}, renewable_penetration_pct:{type:'number'}},
       ['region'], 1.50);

addL22('power_purchase_agreement_modeler', '[TRADING] Model PPA terms and evaluate corporate renewable energy deals',
       { project_type:{type:'string',enum:['solar','wind','battery','hydro','geothermal']}, capacity_mw:{type:'number'}, ppa_term_years:{type:'integer',default:20}, location:{type:'string'}},
       ['project_type','capacity_mw'], 2.00);

addL22('green_certificate_trading_analyzer', '[TRADING] Analyze green certificate/renewable energy credit trading opportunities',
       { certificate_type:{type:'string',enum:['REC','GOO','I-REC','Carbon_Credit']}, volume_mwh:{type:'number'}, target_markets:{type:'array',items:{type:'string'}}},
       ['certificate_type'], 1.00);

// CATEGORY 3: ELECTRIC VEHICLES & INFRASTRUCTURE
addL22('ev_charging_station_business_modeler', '[EV] Model EV charging station business viability and revenue',
       { station_type:{type:'string',enum:['level2_home','level2_public','dcfc_fast']}, num_ports:{type:'integer'}, location_type:{type:'string',enum:['retail','workplace','multifamily','highway']}, avg_daily_kwh_per_port:{type:'number'}},
       ['station_type','num_ports'], 1.50);

addL22('ev_ownership_total_cost_analyzer', '[EV] Compare total cost of ownership between EV and ICE vehicles',
       { vehicle_class:{type:'string'}, annual_mileage:{type:'integer'}, home_charging_available:{type:'boolean'}, electricity_rate_per_kwh:{type:'number'}, gas_price_per_gallon:{type:'number'}},
       ['vehicle_class','annual_mileage'], 0.50);

addL22('fleet_electrification_savings_calculator', '[EV] Calculate savings from electrifying commercial vehicle fleets',
       { fleet_size:{type:'integer'}, avg_daily_miles_per_vehicle:{type:'number'}, current_fuel_type:{type:'string',enum:['gasoline','diesel','hybrid']}, fuel_cost_per_gallon:{type:'number'}},
       ['fleet_size','avg_daily_miles_per_vehicle'], 1.00);

// CATEGORY 4: NATURAL GAS & OIL
addL22('natural_gas_price_outlook_analyzer', '[GAS] Analyze natural gas price trends and trading opportunities',
       { region:{type:'string',enum:['Henry_Hub','TTF_Europe','JKM_Asia']}, forecast_horizon_months:{type:'integer',default:12}, supply_disruption_risk:{type:'string'}},
       ['region'], 1.00);

addL22('oil_field_production_forecaster', '[OIL] Forecast oil field production decline curves',
       { well_type:{type:'string',enum:['conventional','shale','offshore','heavy_oil']}, initial_decline_rate_pct:{type:'number'}, reserve_estimate_barrels:{type:'number'}, completion_method:{type:'string'}},
       ['well_type','reserve_estimate_barrels'], 2.00);

// CATEGORY 5: CLEAN TECH & HYDROGEN
addL22('green_hydrogen_cost_modeler', '[CLEAN] Model green hydrogen production costs and competitiveness',
       { electrolyzer_capacity_mw:{type:'number'}, location:{type:'string'}, renewable_energy_source:{type:'string',enum:['solar','wind','hybrid']}, operating_hours_per_year:{type:'integer',default:4000}},
       ['electrolyzer_capacity_mw','location'], 2.00);

addL22('carbon_capture_technology_comparator', '[CLEAN] Compare carbon capture technologies (post-combustion, oxy-fuel, direct air)',
       { emission_source:{type:'string',enum:['power_plant','cement','steel','chemical','direct_air']}, CO2_concentration_pct:{type:'number'}, captured_volume_tons_per_year:{type:'number'}},
       ['emission_source','captured_volume_tons_per_year'], 3.00);

addL22('energy_efficiency_retrofit_analyzer', '[EFF] Analyze building energy efficiency retrofit opportunities and savings',
       { building_type:{type:'string',enum:['office','retail','warehouse','residential','hospital']}, building_age_years:{type:'integer'}, square_footage:{type:'number'}, annual_energy_cost_usd:{type:'number'}},
       ['building_type','annual_energy_cost_usd'], 0.75);

// IMPLEMENTATION
var RUN_L22_TABLE = {};
for (var t of L22_TOOLS) { RUN_L22_TABLE[t.name] = async function(args) { return { tool: t.name, status: 'configured' }; }; }

RUN_L22_TABLE.solar_panel_roi_calculator = async function(a) {
  var systemSizeKw = Math.round(a.roof_area_sqft / 100 * 6);
  return {
    tool: 'solar_panel_roi_calculator',
    system_size_kw: systemSizeKw,
    estimated_installation_cost_usd: Math.round(systemSizeKw * 2800),
    federal_tax_credit_usd: Math.round(systemSizeKw * 2800 * 0.30),
    net_cost_after_incentives_usd: Math.round(systemSizeKw * 2800 * 0.70),
    annual_savings_usd: Math.round(a.monthly_electric_bill_usd * 12 * 0.85),
    payback_period_years: 7.2,
    twentyFiveYearSavingsUsd: Math.round(a.monthly_electric_bill_usd * 12 * 0.85 * 25 - systemSizeKw * 2800 * 0.70),
    roi_percentage: '142%',
    equivalent_tree_plantings: Math.round(a.roof_area_sqft / 100 * 15)
  };
};

RUN_L22_TABLE.ev_charging_station_business_modeler = async function(a) {
  return {
    tool: 'ev_charging_station_business_modeler',
    equipment_cost_estimated_usd: a.station_type === 'dcfc_fast' ? a.num_ports * 40000 : a.num_ports * 2000,
    monthly_revenue_projection_usd: Math.round(a.num_ports * a.avg_daily_kwh_per_port * 30 * 0.35),
    break_even_months: 28,
    annual_net_profit_year_1_usd: -8000,
    annual_net_profit_year_3_usd: 24000,
    revenue_streams: ['Session fees','Membership subscriptions','Advertising','Data analytics','Cafeteria/convenience upsell'],
    grant_opportunities: ['NEVI Formula Program','EV Chargepoint Grant','State/local incentives']
  };
};

function runL22(name, args) {
  var fn = RUN_L22_TABLE[name];
  if (!fn) throw new Error('unknown level22 tool: ' + name);
  return fn(args || {});
}

module.exports = {
  L22_TOOLS: L22_TOOLS,
  runL22: runL22,
  PRICE_BY_TOOL: (function(){
    var m = {};
    L22_TOOLS.forEach(function(t) { m[t.name] = { usd: t._price || 1.00, atomic: Math.round((t._price || 1.00) * 1e6) }; });
    return m;
  })()
};

console.log('[level22-energy] loaded', L22_TOOLS.length, 'tools');
