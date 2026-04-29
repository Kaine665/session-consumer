/** Default query */
export function createSearchQuery(query, overrides) {
    return {
        query,
        limit: 50,
        ...overrides,
    };
}
//# sourceMappingURL=search.js.map