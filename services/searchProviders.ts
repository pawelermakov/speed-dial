// Compatibility exports; UI receives the search service from its application.
export * from '../modules/dial/modules/search/adapters/providers';
export * from '../modules/dial/modules/search/helpers/presentation';
export { maxSearchQuery } from '../modules/dial/modules/search/services/suggestions';
import { createSearchModule } from '../modules/dial/modules/search/newtab';
export const providerSuggestions = createSearchModule().suggestions;
