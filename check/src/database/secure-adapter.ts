import { db, query, queryOne, run } from './index';
import { QueryBuilder, buildSelectQuery, buildInsertQuery, buildUpdateQuery, buildDeleteQuery } from '../utils/query-builder';
import { log } from '../utils/logger';

export interface SecureQueryOptions {
  useQueryBuilder?: boolean;
  logQueries?: boolean;
}

export class SecureDatabaseAdapter {
  private static isEnabled = process.env.USE_QUERY_BUILDER === 'true';
  private static logQueries = process.env.LOG_SQL_QUERIES === 'true';

  static setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    QueryBuilder.setEnabled(enabled);
  }

  static async query<T = any>(
    sql: string,
    params: any[] = [],
    options?: SecureQueryOptions
  ): Promise<T[]> {
    const useBuilder = options?.useQueryBuilder ?? this.isEnabled;
    
    if (this.logQueries || options?.logQueries) {
      log.debug('Executing query', { sql, params, useQueryBuilder: useBuilder });
    }

    // If query builder is disabled, use legacy method
    if (!useBuilder) {
      return query<T>(sql, params);
    }

    // For complex queries that can't be easily parsed, fall back to parameterized queries
    // but still validate them
    this.validateQuery(sql);
    return query<T>(sql, params);
  }

  static async queryOne<T = any>(
    sql: string,
    params: any[] = [],
    options?: SecureQueryOptions
  ): Promise<T | null> {
    const useBuilder = options?.useQueryBuilder ?? this.isEnabled;
    
    if (this.logQueries || options?.logQueries) {
      log.debug('Executing queryOne', { sql, params, useQueryBuilder: useBuilder });
    }

    if (!useBuilder) {
      return queryOne<T>(sql, params);
    }

    this.validateQuery(sql);
    return queryOne<T>(sql, params);
  }

  static async run(
    sql: string,
    params: any[] = [],
    options?: SecureQueryOptions
  ): Promise<void> {
    const useBuilder = options?.useQueryBuilder ?? this.isEnabled;
    
    if (this.logQueries || options?.logQueries) {
      log.debug('Executing run', { sql, params, useQueryBuilder: useBuilder });
    }

    if (!useBuilder) {
      return run(sql, params);
    }

    this.validateQuery(sql);
    return run(sql, params);
  }

  // Secure select with QueryBuilder
  static async select<T = any>(
    table: string,
    options: {
      columns?: string[];
      where?: Record<string, unknown>;
      orderBy?: { column: string; direction: 'ASC' | 'DESC' };
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<T[]> {
    if (!this.isEnabled) {
      // Build SQL manually for legacy mode
      let sql = `SELECT ${options.columns?.join(', ') || '*'} FROM ${table}`;
      const params: any[] = [];
      
      if (options.where) {
        const conditions = Object.entries(options.where).map(([col, val]) => {
          params.push(val);
          return `${col} = ?`;
        });
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy.column} ${options.orderBy.direction}`;
      }
      
      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
      }
      
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }
      
      return query<T>(sql, params);
    }

    const { sql, params } = buildSelectQuery(
      table,
      options.columns,
      options.where,
      options.orderBy,
      options.limit,
      options.offset
    );
    
    return query<T>(sql, params);
  }

  // Secure insert with QueryBuilder
  static async insert(
    table: string,
    data: Record<string, unknown>,
    options?: SecureQueryOptions
  ): Promise<void> {
    if (!this.isEnabled && !options?.useQueryBuilder) {
      const columns = Object.keys(data);
      const values = Object.values(data);
      const placeholders = columns.map(() => '?').join(', ');
      
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      return run(sql, values);
    }

    const { sql, params } = buildInsertQuery(table, data);
    return run(sql, params);
  }

  // Secure update with QueryBuilder
  static async update(
    table: string,
    data: Record<string, unknown>,
    where: Record<string, unknown>,
    options?: SecureQueryOptions
  ): Promise<void> {
    if (!this.isEnabled && !options?.useQueryBuilder) {
      const setClauses = Object.keys(data).map(col => `${col} = ?`).join(', ');
      const whereClauses = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
      
      const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`;
      const params = [...Object.values(data), ...Object.values(where)];
      
      return run(sql, params);
    }

    const { sql, params } = buildUpdateQuery(table, data, where);
    return run(sql, params);
  }

  // Secure delete with QueryBuilder
  static async delete(
    table: string,
    where: Record<string, unknown>,
    options?: SecureQueryOptions
  ): Promise<void> {
    if (!this.isEnabled && !options?.useQueryBuilder) {
      const whereClauses = Object.keys(where).map(col => `${col} = ?`).join(' AND ');
      const sql = `DELETE FROM ${table} WHERE ${whereClauses}`;
      const params = Object.values(where);
      
      return run(sql, params);
    }

    const { sql, params } = buildDeleteQuery(table, where);
    return run(sql, params);
  }

  // Create a QueryBuilder instance
  static createBuilder(): QueryBuilder {
    return QueryBuilder.create(db);
  }

  // Validate query for dangerous patterns
  private static validateQuery(sql: string): void {
    const dangerous = [
      /;\s*DROP\s+/i,
      /;\s*DELETE\s+/i,
      /;\s*UPDATE\s+/i,
      /;\s*INSERT\s+/i,
      /--/,
      /\/\*/,
      /\*\//,
      /\bUNION\b.*\bSELECT\b/i,
      /\bEXEC\b/i,
      /\bEXECUTE\b/i
    ];

    for (const pattern of dangerous) {
      if (pattern.test(sql)) {
        log.error('Potentially dangerous SQL pattern detected', { sql, pattern: pattern.toString() });
        throw new Error('Invalid SQL query detected');
      }
    }
  }
}

// Export convenience functions
export const secureQuery = SecureDatabaseAdapter.query.bind(SecureDatabaseAdapter);
export const secureQueryOne = SecureDatabaseAdapter.queryOne.bind(SecureDatabaseAdapter);
export const secureRun = SecureDatabaseAdapter.run.bind(SecureDatabaseAdapter);
export const secureSelect = SecureDatabaseAdapter.select.bind(SecureDatabaseAdapter);
export const secureInsert = SecureDatabaseAdapter.insert.bind(SecureDatabaseAdapter);
export const secureUpdate = SecureDatabaseAdapter.update.bind(SecureDatabaseAdapter);
export const secureDelete = SecureDatabaseAdapter.delete.bind(SecureDatabaseAdapter);
export const createQueryBuilder = SecureDatabaseAdapter.createBuilder.bind(SecureDatabaseAdapter);