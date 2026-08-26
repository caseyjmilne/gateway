/**
 * No front-end behavior of its own -- unlike gateway/datatable's own
 * view.js (which initializes DataTables on every table it finds), this
 * block has nothing to initialize: all interactivity lives in the
 * sibling gateway/data-cards-search/-page-size/-pagination/-results
 * blocks (see shared/cards.js). This file exists solely so the build
 * picks it up as an entry and extracts style.scss into
 * build/style-view.css, matching block.json's "style" field path.
 */
import './style.scss';
