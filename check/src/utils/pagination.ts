import { database } from '@/database';
import { sql } from 'drizzle-orm';

export interface PaginatedResult<T> {
  items: T[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
    totalCount?: number;
  };
}

export interface PaginationOptions {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

export class CursorPagination {
  static encode(cursor: any): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }
  
  static decode(cursor: string): any {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64url').toString());
    } catch {
      throw new Error('Invalid cursor');
    }
  }
  
  /**
   * Paginate with cursor-based pagination
   */
  static async paginate<T>(options: {
    query: any; // Drizzle query builder
    limit: number;
    cursor?: string;
    cursorColumn: string;
    orderDirection?: 'asc' | 'desc';
  }): Promise<PaginatedResult<T>> {
    const { query, limit, cursor, cursorColumn, orderDirection = 'desc' } = options;
    
    let finalQuery = query;
    
    // Apply cursor filter if provided
    if (cursor) {
      const decodedCursor = this.decode(cursor);
      const cursorValue = decodedCursor.value;
      
      if (orderDirection === 'desc') {
        finalQuery = finalQuery.where(sql`${sql.identifier(cursorColumn)} < ${cursorValue}`);
      } else {
        finalQuery = finalQuery.where(sql`${sql.identifier(cursorColumn)} > ${cursorValue}`);
      }
    }
    
    // Add 1 to limit to check if there are more results
    const results = await finalQuery.limit(limit + 1);
    
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, -1) : results;
    
    const startCursor = items.length > 0
      ? this.encode({ value: items[0][cursorColumn] })
      : null;
      
    const endCursor = items.length > 0
      ? this.encode({ value: items[items.length - 1][cursorColumn] })
      : null;
    
    return {
      items,
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!cursor, // Simplified - in production you'd check properly
        startCursor,
        endCursor
      }
    };
  }
}

/**
 * Offset-based pagination for simpler use cases
 */
export class OffsetPagination {
  static async paginate<T>(options: {
    query: any;
    page: number;
    pageSize: number;
    countQuery?: any;
  }): Promise<{
    items: T[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalCount: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  }> {
    const { query, page, pageSize, countQuery } = options;
    const offset = (page - 1) * pageSize;
    
    // Execute paginated query
    const items = await query.limit(pageSize).offset(offset);
    
    // Get total count if count query provided
    let totalCount = 0;
    if (countQuery) {
      const countResult = await countQuery;
      totalCount = countResult[0]?.count || 0;
    } else {
      // Estimate from current page
      totalCount = offset + items.length + (items.length === pageSize ? pageSize : 0);
    }
    
    const totalPages = Math.ceil(totalCount / pageSize);
    
    return {
      items,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    };
  }
}

/**
 * Keyset pagination for very large datasets
 */
export class KeysetPagination {
  static async paginate<T>(options: {
    query: any;
    pageSize: number;
    lastValues?: Record<string, any>;
    orderBy: Array<{ column: string; direction: 'asc' | 'desc' }>;
  }): Promise<{
    items: T[];
    nextKey: Record<string, any> | null;
  }> {
    const { query, pageSize, lastValues, orderBy } = options;
    
    let finalQuery = query;
    
    // Apply keyset filter if we have last values
    if (lastValues && orderBy.length > 0) {
      const conditions: any[] = [];
      
      // Build complex WHERE clause for multi-column ordering
      for (let i = 0; i < orderBy.length; i++) {
        const subConditions: any[] = [];
        
        // All previous columns must be equal
        for (let j = 0; j < i; j++) {
          const col = orderBy[j].column;
          subConditions.push(sql`${sql.identifier(col)} = ${lastValues[col]}`);
        }
        
        // Current column must be greater/less than
        const currentCol = orderBy[i].column;
        const currentDir = orderBy[i].direction;
        const currentVal = lastValues[currentCol];
        
        if (currentDir === 'asc') {
          subConditions.push(sql`${sql.identifier(currentCol)} > ${currentVal}`);
        } else {
          subConditions.push(sql`${sql.identifier(currentCol)} < ${currentVal}`);
        }
        
        if (subConditions.length > 0) {
          conditions.push(sql`(${sql.join(subConditions, sql` AND `)})`);
        }
      }
      
      if (conditions.length > 0) {
        finalQuery = finalQuery.where(sql`${sql.join(conditions, sql` OR `)}`);
      }
    }
    
    // Apply ordering
    for (const { column, direction } of orderBy) {
      finalQuery = finalQuery.orderBy(
        direction === 'asc' 
          ? sql`${sql.identifier(column)} ASC`
          : sql`${sql.identifier(column)} DESC`
      );
    }
    
    const items = await finalQuery.limit(pageSize);
    
    // Extract next key from last item
    const nextKey = items.length === pageSize
      ? orderBy.reduce((acc, { column }) => {
          acc[column] = items[items.length - 1][column];
          return acc;
        }, {} as Record<string, any>)
      : null;
    
    return { items, nextKey };
  }
}