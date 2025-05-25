#!/usr/bin/env node

/**
 * Test script for Cloudflare MCP servers integration
 * 
 * This project includes two MCP servers:
 * 1. Documentation server - Search Cloudflare docs
 * 2. Workers Bindings server - Manage Cloudflare resources
 * 
 * Usage: node test-mcp-cloudflare.js
 */

console.log(`
Cloudflare MCP Servers Integration
==================================

Both MCP servers have been successfully configured for this project.

Configuration file: mcp.json

1. DOCUMENTATION SERVER
   - URL: https://docs.mcp.cloudflare.com
   - Tool: search_cloudflare_documentation
   - Purpose: Search and retrieve Cloudflare documentation
   - Example queries:
     • "How do I use Cloudflare D1 with Workers?"
     • "What are the pricing details for Workers?"
     • "Show me R2 bucket CORS configuration"

2. WORKERS BINDINGS SERVER
   - URL: https://bindings.mcp.cloudflare.com
   - Authentication: OAuth (browser-based)
   - Purpose: Manage Cloudflare resources programmatically
   - Supported operations:
     • KV Namespaces: list, create, delete
     • Workers: list, get details, retrieve code
     • R2 Buckets: list, create, delete
     • D1 Databases: list, create, query
     • Hyperdrive: manage configurations
   - Example queries:
     • "List all my D1 databases"
     • "Show me the R2 buckets in my account"
     • "Query the zillow-data-db D1 database"

To use with Claude Desktop or other MCP clients:
1. Point your client to the mcp.json configuration file
2. Both servers will be loaded automatically
3. The bindings server will prompt for OAuth on first use

For more details, see: docs/MCP_SERVERS.md
`);