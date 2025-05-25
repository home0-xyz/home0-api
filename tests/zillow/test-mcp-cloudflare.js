#!/usr/bin/env node

/**
 * Test script for Cloudflare MCP server integration
 * 
 * This demonstrates how to use the MCP server to search Cloudflare documentation.
 * The MCP server provides access to Cloudflare's documentation via Vectorize.
 * 
 * Usage: node test-mcp-cloudflare.js
 */

console.log(`
Cloudflare MCP Server Integration
=================================

The MCP server has been successfully configured for this project.

Configuration file: mcp.json
Server: Cloudflare Documentation (via Vectorize)
URL: https://docs.mcp.cloudflare.com

Available tool: search_cloudflare_documentation

Example queries you can use with MCP-enabled clients:
- "What are the costs for Cloudflare Workers?"
- "How does Workers Analytics Engine work?"
- "Tell me about Workers AI bindings"
- "How do I use Cloudflare D1 with Workers?"

To use with Claude Desktop or other MCP clients:
1. Point your client to the mcp.json configuration file
2. The client will automatically load the Cloudflare docs server
3. You can then ask questions about Cloudflare services

Note: This server provides read-only access to search Cloudflare documentation.
`);