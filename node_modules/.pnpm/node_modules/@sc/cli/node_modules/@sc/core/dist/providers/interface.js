/** Filter a list of providers to those whose data directory exists. */
export function detectAvailable(providers) {
    return providers.filter((p) => p.detect());
}
//# sourceMappingURL=interface.js.map