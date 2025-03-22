import { getDbConnection, closeDbConnections } from '../index';
import { log } from '../../utils/logger.utils';
import { users } from '../schema';
import { eq, count } from 'drizzle-orm';

async function testTransactions() {
  try {
    log('Starting transaction test...', 'info');
    
    // Get a connection from the pool
    const db = await getDbConnection();
    
    // Test a transaction with the pool
    log('Testing transaction handling...', 'info');
    
    const testUser = {
      id: 'test-transaction-user',
      email: 'transaction-test@example.com',
      firstName: 'Transaction',
      lastName: 'Test',
      password: 'test-password-hash',
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    try {
      await db.transaction(async (tx) => {
        log('Inserting test user in transaction...', 'info');
        await tx.insert(users).values(testUser).execute();
        
        // Query to verify insertion
        const insertedUser = await tx.select().from(users).where(eq(users.id, testUser.id)).limit(1).execute();
        log(`User found in transaction: ${insertedUser.length > 0}`, 'info');
        
        // Simulate a failure condition to test rollback
        if (process.env.TEST_ROLLBACK === 'true') {
          log('Simulating transaction failure for rollback test...', 'info');
          throw new Error('Test rollback');
        }
      });
      
      log('Transaction committed successfully', 'info');
      
      // Verify outside transaction
      const userAfterCommit = await db.select().from(users).where(eq(users.id, testUser.id)).limit(1).execute();
      log(`User exists after commit: ${userAfterCommit.length > 0}`, 'info');
      
      // Clean up - delete test user
      await db.delete(users).where(eq(users.id, testUser.id)).execute();
      log('Test user removed', 'info');
      
    } catch (error) {
      log(`Transaction error: ${error}`, 'error');
      
      // Verify rollback happened
      const userAfterRollback = await db.select().from(users).where(eq(users.id, testUser.id)).limit(1).execute();
      log(`User exists after rollback: ${userAfterRollback.length > 0}`, 'info');
      
      if (userAfterRollback.length > 0) {
        // Clean up if rollback failed
        await db.delete(users).where(eq(users.id, testUser.id)).execute();
        log('Had to manually remove test user - rollback may have failed', 'warn');
      } else {
        log('Rollback successful - test user not found', 'info');
      }
    }
    
    // Test concurrent connections from the pool
    log('Testing multiple concurrent connections from pool...', 'info');
    
    const numConnections = 5;
    const queries = Array(numConnections).fill(0).map(async (_, i) => {
      const poolConn = await getDbConnection();
      log(`Connection ${i+1}: Running query...`, 'info');
      const result = await poolConn.select({ totalUsers: count(users.id) }).from(users).execute();
      log(`Connection ${i+1}: Found ${result[0]?.totalUsers || 0} users`, 'info');
      return result;
    });
    
    await Promise.all(queries);
    log('All concurrent queries completed successfully', 'info');
    
    log('Transaction and pool tests completed successfully', 'info');
  } catch (error) {
    log(`Error during transaction test: ${error}`, 'error');
    throw error;
  } finally {
    await closeDbConnections();
  }
}

// When this script is executed directly
if (require.main === module) {
  testTransactions()
    .then(() => {
      log('Tests completed successfully', 'info');
      process.exit(0);
    })
    .catch((error) => {
      log(`Tests failed: ${error}`, 'error');
      process.exit(1);
    });
}

export default testTransactions; 