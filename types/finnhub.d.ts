// Type declarations for the finnhub npm package
// The official package is a CommonJS module with limited TypeScript support

declare module 'finnhub' {
    interface DefaultApi {
        symbolSearch(query: string, opts: object, callback: (err: unknown, data: unknown, response: unknown) => void): void
        companyProfile2(opts: { symbol: string }, callback: (err: unknown, data: unknown, response: unknown) => void): void
        quote(symbol: string, callback: (err: unknown, data: unknown, response: unknown) => void): void
        companyBasicFinancials(symbol: string, metric: string, callback: (err: unknown, data: unknown, response: unknown) => void): void
        companyNews(symbol: string, from: string, to: string, callback: (err: unknown, data: unknown, response: unknown) => void): void
    }

    const DefaultApi: new (apiKey: string) => DefaultApi
    export { DefaultApi }
    const finnhubExport = { DefaultApi }
    export default finnhubExport
}
