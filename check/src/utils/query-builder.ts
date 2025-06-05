import { log } from './logger';
import type { Database } from 'bun:sqlite';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface QueryBuilderConfig {
  isEnabled: boolean;
  allowedTables: string[];
  maxLimit: number;
}

export class QueryBuilder {
  private query: string = '';
  private params: unknown[] = [];
  private tableName: string = '';
  private selectColumns: string[] = [];
  private whereConditions: string[] = [];
  private joinClauses: string[] = [];
  private orderByClause: string = '';
  private limitValue?: number;
  private offsetValue?: number;
  
  private static config: QueryBuilderConfig = {
    isEnabled: process.env.USE_QUERY_BUILDER === 'true',
    allowedTables: ['users', 'conversations', 'audios', 'subscriptions', 'notifications', 'sessions'],
    maxLimit: 1000
  };

  constructor(private db?: Database) {}

  static isEnabled(): boolean {
    return this.config.isEnabled;
  }

  static setEnabled(enabled: boolean): void {
    this.config.isEnabled = enabled;
  }

  // Table validation
  private validateTable(table: string): void {
    if (!QueryBuilder.config.allowedTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}. Allowed tables: ${QueryBuilder.config.allowedTables.join(', ')}`);
    }
  }

  // Column validation
  private validateColumns(columns: string[]): void {
    const validColumnPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    for (const col of columns) {
      if (!validColumnPattern.test(col)) {
        throw new Error(`Invalid column name: ${col}`);
      }
    }
  }

  // SELECT
  select(columns: string | string[] = ['*']): this {
    const cols = Array.isArray(columns) ? columns : [columns];
    if (cols.length > 0 && cols[0] !== '*') {
      this.validateColumns(cols);
    }
    this.selectColumns = cols;
    return this;
  }

  // FROM
  from(table: string): this {
    this.validateTable(table);
    this.tableName = table;
    return this;
  }

  // WHERE conditions
  where(column: string, operator: string, value: unknown): this {
    this.validateColumns([column]);
    const validOperators = ['=', '!=', '<>', '<', '>', '<=', '>=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS', 'IS NOT'];
    
    if (!validOperators.includes(operator.toUpperCase())) {
      throw new Error(`Invalid operator: ${operator}`);
    }

    if (operator.toUpperCase() === 'IN' || operator.toUpperCase() === 'NOT IN') {
      if (!Array.isArray(value)) {
        throw new Error(`Value must be an array for ${operator} operator`);
      }
      const placeholders = value.map(() => '?').join(', ');
      this.whereConditions.push(`${column} ${operator} (${placeholders})`);
      this.params.push(...value);
    } else {
      this.whereConditions.push(`${column} ${operator} ?`);
      this.params.push(value);
    }
    
    return this;
  }

  whereNull(column: string): this {
    this.validateColumns([column]);
    this.whereConditions.push(`${column} IS NULL`);
    return this;
  }

  whereNotNull(column: string): this {
    this.validateColumns([column]);
    this.whereConditions.push(`${column} IS NOT NULL`);
    return this;
  }

  // JOIN
  join(table: string, column1: string, column2: string): this {
    this.validateTable(table);
    this.validateColumns([column1, column2]);
    this.joinClauses.push(`JOIN ${table} ON ${column1} = ${column2}`);
    return this;
  }

  leftJoin(table: string, column1: string, column2: string): this {
    this.validateTable(table);
    this.validateColumns([column1, column2]);
    this.joinClauses.push(`LEFT JOIN ${table} ON ${column1} = ${column2}`);
    return this;
  }

  // ORDER BY
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.validateColumns([column]);
    if (!['ASC', 'DESC'].includes(direction.toUpperCase())) {
      throw new Error(`Invalid order direction: ${direction}`);
    }
    this.orderByClause = `ORDER BY ${column} ${direction}`;
    return this;
  }

  // LIMIT
  limit(value: number): this {
    if (value <= 0 || value > QueryBuilder.config.maxLimit) {
      throw new Error(`Invalid limit: ${value}. Must be between 1 and ${QueryBuilder.config.maxLimit}`);
    }
    this.limitValue = value;
    return this;
  }

  // OFFSET
  offset(value: number): this {
    if (value < 0) {
      throw new Error(`Invalid offset: ${value}. Must be non-negative`);
    }
    this.offsetValue = value;
    return this;
  }

  // Build the query
  private build(): { sql: string; params: unknown[] } {
    if (!this.tableName) {
      throw new Error('Table name is required');
    }

    const parts: string[] = [];
    
    // SELECT
    const columns = this.selectColumns.length > 0 ? this.selectColumns.join(', ') : '*';
    parts.push(`SELECT ${columns}`);
    
    // FROM
    parts.push(`FROM ${this.tableName}`);
    
    // JOIN
    if (this.joinClauses.length > 0) {
      parts.push(...this.joinClauses);
    }
    
    // WHERE
    if (this.whereConditions.length > 0) {
      parts.push(`WHERE ${this.whereConditions.join(' AND ')}`);
    }
    
    // ORDER BY
    if (this.orderByClause) {
      parts.push(this.orderByClause);
    }
    
    // LIMIT
    if (this.limitValue !== undefined) {
      parts.push(`LIMIT ${this.limitValue}`);
    }
    
    // OFFSET
    if (this.offsetValue !== undefined) {
      parts.push(`OFFSET ${this.offsetValue}`);
    }

    const sql = parts.join(' ');
    
    log.debug('QueryBuilder generated SQL', { sql, params: this.params });
    
    return { sql, params: this.params };
  }

  // Execute the query
  async execute<T = any>(): Promise<T[]> {
    if (!this.db) {
      throw new Error('Database connection is required to execute queries');
    }

    const { sql, params } = this.build();
    
    try {
      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as T[];
      return results;
    } catch (error) {
      log.error('QueryBuilder execution error', { sql, params, error });
      throw error;
    }
  }

  // Get SQL without executing
  toSQL(): { sql: string; params: unknown[] } {
    return this.build();
  }

  // INSERT builder
  static insert(table: string, data: Record<string, unknown>): { sql: string; params: unknown[] } {
    const builder = new QueryBuilder();
    builder.validateTable(table);
    
    const columns = Object.keys(data);
    builder.validateColumns(columns);
    
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    log.debug('QueryBuilder INSERT', { sql, params: values });
    
    return { sql, params: values };
  }

  // UPDATE builder
  static update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): { sql: string; params: unknown[] } {
    const builder = new QueryBuilder();
    builder.validateTable(table);
    
    const updateColumns = Object.keys(data);
    builder.validateColumns(updateColumns);
    
    const whereColumns = Object.keys(where);
    builder.validateColumns(whereColumns);
    
    const setClauses = updateColumns.map(col => `${col} = ?`).join(', ');
    const whereClauses = whereColumns.map(col => `${col} = ?`).join(' AND ');
    
    const sql = `UPDATE ${table} SET ${setClauses} WHERE ${whereClauses}`;
    const params = [...Object.values(data), ...Object.values(where)];
    
    log.debug('QueryBuilder UPDATE', { sql, params });
    
    return { sql, params };
  }

  // DELETE builder
  static delete(table: string, where: Record<string, unknown>): { sql: string; params: unknown[] } {
    const builder = new QueryBuilder();
    builder.validateTable(table);
    
    const whereColumns = Object.keys(where);
    builder.validateColumns(whereColumns);
    
    const whereClauses = whereColumns.map(col => `${col} = ?`).join(' AND ');
    
    const sql = `DELETE FROM ${table} WHERE ${whereClauses}`;
    const params = Object.values(where);
    
    log.debug('QueryBuilder DELETE', { sql, params });
    
    return { sql, params };
  }

  // Factory method for database-connected builder
  static create(db: Database): QueryBuilder {
    return new QueryBuilder(db);
  }
}

// Helper functions for backward compatibility
export function buildSelectQuery(
  table: string,
  columns: string[] = ['*'],
  where?: Record<string, unknown>,
  orderBy?: { column: string; direction: 'ASC' | 'DESC' },
  limit?: number,
  offset?: number
): { sql: string; params: unknown[] } {
  const builder = new QueryBuilder();
  
  builder.select(columns).from(table);
  
  if (where) {
    Object.entries(where).forEach(([column, value]) => {
      if (value === null) {
        builder.whereNull(column);
      } else {
        builder.where(column, '=', value);
      }
    });
  }
  
  if (orderBy) {
    builder.orderBy(orderBy.column, orderBy.direction);
  }
  
  if (limit !== undefined) {
    builder.limit(limit);
  }
  
  if (offset !== undefined) {
    builder.offset(offset);
  }
  
  return builder.toSQL();
}

export function buildInsertQuery(table: string, data: Record<string, unknown>): { sql: string; params: unknown[] } {
  return QueryBuilder.insert(table, data);
}

export function buildUpdateQuery(
  table: string,
  data: Record<string, unknown>,
  where: Record<string, unknown>
): { sql: string; params: unknown[] } {
  return QueryBuilder.update(table, data, where);
}

export function buildDeleteQuery(table: string, where: Record<string, unknown>): { sql: string; params: unknown[] } {
  return QueryBuilder.delete(table, where);
}