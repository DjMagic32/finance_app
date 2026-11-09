// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_cute_captain_britain.sql';
import m0001 from './0001_strong_sphinx.sql';
import m0002 from './0002_brown_master_chief.sql';
import m0003 from './0003_bumpy_hannibal_king.sql';
import m0004 from './0004_first_umar.sql';
import m0005 from './0005_proyectos.sql';
import m0006 from './0006_work.sql';
import m0007 from './0007_work_payments.sql';
import m0008 from './0008_debt_transactions.sql';
import m0009 from './0009_debt_currencies.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003,
m0004,
m0005,
m0006,
m0007,
m0008,
m0009
    }
  }
