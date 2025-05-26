# Home0 Platform

> Open source platform to help people use AI and technology to find homes

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Built with Cloudflare Workers](https://img.shields.io/badge/Built%20with-Cloudflare%20Workers-F38020)](https://workers.cloudflare.com)

## 🏠 Vision

Home0 is building an open-source ecosystem that democratizes access to real estate data and AI-powered home search tools. We believe finding a home should be easier, more transparent, and powered by the best technology available.

## 🚀 What We're Building

- **Real Estate Data Pipeline**: Automated collection and processing of property listings
- **AI-Ready Infrastructure**: Structured data optimized for machine learning and AI applications
- **Open APIs**: Free access to real estate data for developers and researchers
- **Smart Search Tools**: AI-powered property matching and recommendations (coming soon)
- **Community-Driven**: Open source and transparent development

## 📦 Current Features

### Real Estate Data Collection
- **Automated Property Search**: Collect listings by location with customizable filters
- **Comprehensive Property Details**: Photos, price history, tax records, school information
- **Webhook Integration**: Real-time updates via BrightData API
- **Durable Workflows**: Reliable processing with Cloudflare Workers
- **Secure API**: API key authentication and webhook validation

### Data Storage & Access
- **Cloudflare D1 Database**: Structured property data with efficient querying
- **R2 Object Storage**: Raw data backups and large file storage
- **RESTful API**: Easy access to all collected data
- **Batch Processing**: Handle large-scale data collection efficiently

## 🛠️ Technology Stack

- **Runtime**: [Cloudflare Workers](https://workers.cloudflare.com) (Edge computing)
- **Workflows**: [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) (Durable execution)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at the edge)
- **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible object storage)
- **Data Source**: [BrightData API](https://brightdata.com) (Real estate data)
- **Language**: TypeScript

## 🚦 Quick Start

### Prerequisites
- Node.js 18+
- Cloudflare account (free tier works)
- BrightData API token (for data collection)

### Installation

```bash
# Clone the repository
git clone https://github.com/home0-xyz/home0-workers.git
cd home0-workers

# Install dependencies
npm install

# Copy environment variables
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your API tokens
```

### Local Development

```bash
# Start local development server
npm start

# Run database migrations
npm run db:migrate

# Run tests
npm test
```

### Deploy to Cloudflare

```bash
# Set up Cloudflare secrets
wrangler secret put BRIGHTDATA_API_TOKEN
wrangler secret put API_KEY
wrangler secret put WEBHOOK_SECRET

# Deploy to production
npm run deploy
```

## 📡 API Documentation

### Authentication
All API endpoints require an `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" https://your-worker.workers.dev/api/endpoint
```

### Core Endpoints

#### Property Collection
```bash
# Start collecting properties
POST /zillow/collect
{
  "location": "Denver, CO",
  "daysOnZillow": "7 days",
  "listingCategory": "House for sale"
}

# Check collection status
GET /zillow/status?instanceId={id}

# List collected data
GET /zillow/files?location={location}
```

#### Property Details
```bash
# Collect details for specific properties
POST /zillow/details/collect
{
  "zpids": ["12345678", "87654321"],
  "batchSize": 10
}

# Auto-collect details for properties without them
POST /zillow/details/auto
{
  "limit": 50,
  "batchSize": 10
}
```

#### Data Access
```bash
# Query properties
GET /database/properties?city=Denver&limit=10

# Get property details
GET /database/property-details?zpid=12345678

# Custom SQL queries
POST /database/query
{
  "query": "SELECT * FROM properties WHERE price < 500000"
}
```

See [API Reference](docs/API.md) for complete documentation.

## 🗂️ Project Structure

```
home0-workers/
├── src/
│   ├── zillow/           # Zillow data collection
│   │   ├── workflows/    # Durable workflows
│   │   ├── handlers/     # API endpoints
│   │   └── types.ts      # TypeScript definitions
│   ├── database/         # D1 database operations
│   ├── shared/           # Common utilities
│   └── index.ts          # Main entry point
├── migrations/           # Database schema
├── tests/               # Test suites
└── docs/                # Documentation
```

## 🤝 Contributing

We welcome contributions! Home0 is built by the community, for the community.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Keep commits focused and descriptive

### Areas We Need Help

- 🤖 **AI Integration**: Building ML models for property recommendations
- 🗺️ **Data Sources**: Adding support for more real estate platforms
- 🎨 **Frontend**: Creating web and mobile interfaces
- 📊 **Analytics**: Building insights and market analysis tools
- 📚 **Documentation**: Improving guides and examples
- 🧪 **Testing**: Expanding test coverage

## 🗺️ Roadmap

### Phase 1: Foundation ✅
- [x] Cloudflare Workers setup
- [x] BrightData integration
- [x] Basic data collection workflows
- [x] API authentication
- [x] Webhook support

### Phase 2: Scale (Current)
- [ ] Support for multiple data sources
- [ ] Advanced search filters
- [ ] Data normalization pipeline
- [ ] Public API documentation
- [ ] Rate limiting and usage tracking

### Phase 3: Intelligence
- [ ] AI-powered property matching
- [ ] Price prediction models
- [ ] Neighborhood analysis
- [ ] Natural language search
- [ ] Personalized recommendations

### Phase 4: Ecosystem
- [ ] Developer SDKs (Python, JS, Go)
- [ ] Mobile applications
- [ ] Real-time notifications
- [ ] Community marketplace
- [ ] White-label solutions

## 💡 Use Cases

- **Developers**: Build real estate applications with our API
- **Researchers**: Access historical property data for analysis
- **Homebuyers**: Find homes with AI-powered recommendations
- **Investors**: Analyze market trends and opportunities
- **Agents**: Enhance listings with comprehensive data

## 🔒 Security

- **API Authentication**: All endpoints protected with API keys
- **Webhook Validation**: Secure webhook endpoints with secret validation
- **Data Encryption**: Sensitive data encrypted at rest
- **Rate Limiting**: Prevent abuse with request limits
- **Open Source**: Transparent codebase for security audits

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Cloudflare Workers](https://workers.cloudflare.com) for the amazing edge platform
- [BrightData](https://brightdata.com) for reliable real estate data
- Our contributors and community members

## 📞 Contact & Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/home0-xyz/home0-workers/issues)
- **Discussions**: [Join the conversation](https://github.com/home0-xyz/home0-workers/discussions)
- **Email**: support@home0.xyz (coming soon)
- **Twitter**: [@home0xyz](https://twitter.com/home0xyz) (coming soon)

---

Built with ❤️ by the Home0 community. Making home search better, together.