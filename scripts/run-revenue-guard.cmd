@echo off
cd /d "F:\2026\第二次点子\repos\autotasker-hub-aevum"
node scripts\revenue-guard-24x7.js --once >> "F:\2026\第二次点子\data\revenue-guard-scheduled.log" 2>&1
