/**
 * No front-end behavior of its own -- this block's rendered <ul> is
 * static markup; pagination/search/page-size interactivity lives entirely
 * in the sibling gateway/data-cards-pagination/-search/-page-size blocks
 * (see shared/cards.js). This file exists solely so the build picks it up
 * as an entry and extracts style.scss into build/style-view.css, matching
 * block.json's "style" field path -- block.json deliberately declares no
 * "viewScript" for this block, since there'd be nothing for one to do.
 */
import './style.scss';
