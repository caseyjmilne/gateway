<?php
/**
 * Discovers the columns available for a post type (core WP_Post fields +
 * public taxonomies registered for it + registered/discovered post meta --
 * including custom fields added by plugins like ACF, discovered via
 * WordPress core APIs only, never a specific plugin's own API), maps them
 * to friendly labels, and knows how to render a cell value for a given
 * column.
 *
 * Single source of truth used by both Columns_REST_Controller (what the
 * block editor's column picker offers) and blocks/datatable/render.php
 * (validating the columns a block instance actually asks for, and
 * rendering their values) -- so a column key can never make it into the
 * grid unless it's one this class actually recognizes for that post type.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Column_Registry {

	/**
	 * How long the discovered column list is cached per post type. Mainly a
	 * safety-net ceiling -- flush_cache_on_save() actively invalidates it
	 * on every post save, which is when a newly-populated meta key (e.g. a
	 * custom field filled in for the first time) actually needs to become
	 * visible.
	 */
	const CACHE_TTL = 15 * MINUTE_IN_SECONDS;

	/**
	 * Which core (WP_Post field) columns are offered as facets, and which
	 * UI types (subset of 'input'/'select'/'checkboxes') make sense for
	 * each -- the same allow-list *shape* as ALLOWED_CORE_COLUMNS in
	 * Facet_Query, but a distinct list: that one is a SQL-injection safety
	 * boundary (every core column safe to interpolate at all); this one is
	 * a UX judgment (which of those are actually *useful* to filter by,
	 * and how). A key absent here is simply not filterable -- see
	 * get_core_columns()'s own use of this.
	 *
	 * Deliberately excludes: post_date/post_modified (meaningful filtering
	 * wants a real date-range UI; gateway/facet's live compare vocabulary
	 * is contains/equals only), menu_order/comment_count (numeric fields
	 * with no useful contains/equals semantics, and no range UI either).
	 * post_title/post_content/post_excerpt/post_name/post_parent are free
	 * -text ('input' only -- a Select of every distinct title would be
	 * unusable); post_status/post_author are small, enumerable sets
	 * ('select'/'checkboxes' only -- see get_facet_options()'s own
	 * post_author-specific label-resolution fix, needed to make that one
	 * actually usable).
	 */
	const FILTERABLE_CORE_COLUMNS = array(
		'ID'           => array( 'input' ),
		'post_title'   => array( 'input' ),
		'post_content' => array( 'input' ),
		'post_excerpt' => array( 'input' ),
		'post_name'    => array( 'input' ),
		'post_parent'  => array( 'input' ),
		'post_status'  => array( 'select', 'checkboxes' ),
		'post_author'  => array( 'select', 'checkboxes' ),
	);

	/**
	 * Hook cache invalidation into WordPress.
	 */
	public static function init() {
		add_action( 'save_post', array( __CLASS__, 'flush_cache_on_save' ) );
	}

	/**
	 * Invalidate a post type's cached column list whenever a post of that
	 * type is saved -- covers the common case of a custom field (meta key)
	 * being populated for the first time, which the cached list wouldn't
	 * otherwise pick up until it expires on its own.
	 *
	 * @param int $post_id Post ID being saved.
	 */
	public static function flush_cache_on_save( $post_id ) {
		$post_type = get_post_type( $post_id );

		if ( $post_type ) {
			self::flush_cache( $post_type );
		}
	}

	/**
	 * Get every available column for a post type: core WP_Post fields plus
	 * registered/discovered post meta, each as:
	 * [ 'key' => string, 'label' => string, 'type' => 'core'|'meta'|'taxonomy'|'thumbnail',
	 *   'isFilterable' => bool, 'facetType' => string[] ].
	 *
	 * `isFilterable`/`facetType` (a subset of `'input'`/`'select'`/
	 * `'checkboxes'`, empty when `isFilterable` is false) say whether a
	 * column is suitable for use as a facet, and with which UI types --
	 * consumed by both `gateway/datatable`'s own Facets panel and
	 * `gateway/data-cards`'s (`shared/controls/facets-panel.js`) to decide
	 * which fields to offer at all, and by `gateway/card-facet`'s own
	 * `UiTypeControl` usage to trim which UI types make sense for the
	 * chosen field. See each column-producing method below for the
	 * reasoning behind its own values.
	 *
	 * @param string $post_type Post type slug.
	 * @return array[] Column definitions.
	 */
	public static function get_columns( $post_type ) {
		if ( ! post_type_exists( $post_type ) ) {
			return array();
		}

		$cache_key = 'gwdt_cols_' . $post_type . '_' . self::get_cache_version();
		$cached    = get_transient( $cache_key );

		if ( is_array( $cached ) ) {
			return $cached;
		}

		$columns = array_merge(
			self::get_core_columns( $post_type ),
			self::get_thumbnail_column( $post_type ),
			self::get_taxonomy_columns( $post_type ),
			self::get_meta_columns( $post_type )
		);

		set_transient(
			$cache_key,
			$columns,
			/**
			 * Filters how long (in seconds) discovered columns are cached
			 * for a post type. Meta-key discovery scans wp_postmeta, so
			 * this trades a little staleness (new meta keys can take up to
			 * this long to appear in the picker) for not re-scanning on
			 * every block-editor keystroke.
			 *
			 * @param int    $ttl       Cache TTL in seconds.
			 * @param string $post_type Post type slug.
			 */
			apply_filters( 'gateway_datatable_columns_cache_ttl', self::CACHE_TTL, $post_type )
		);

		return $columns;
	}

	/**
	 * Look up a single column's definition for a post type, or null if
	 * that key isn't a recognized column for it.
	 *
	 * @param string $post_type Post type slug.
	 * @param string $key       Column key.
	 * @return array|null
	 */
	public static function get_column( $post_type, $key ) {
		foreach ( self::get_columns( $post_type ) as $column ) {
			if ( $column['key'] === $key ) {
				return $column;
			}
		}

		return null;
	}

	/**
	 * The `get_column()` counterpart for a Collection -- get_column()'s own
	 * `foreach`, against `get_columns_for_collection()` instead.
	 *
	 * @param string $class_name Model class name.
	 * @param string $key        Column key.
	 * @return array|null
	 */
	public static function get_column_for_collection( $class_name, $key ) {
		foreach ( self::get_columns_for_collection( $class_name ) as $column ) {
			if ( $column['key'] === $key ) {
				return $column;
			}
		}

		return null;
	}

	/**
	 * The `get_columns()` counterpart for a Collection (Gateway model)
	 * data source, in the same `{key, label, type, isFilterable,
	 * facetType}` shape -- so `gateway/datatable`'s own column-validation
	 * logic (render.php) and its Columns/Facets panels can treat a model's
	 * fields as just another kind of column, without needing to know
	 * where they actually came from.
	 *
	 * Always leads with a synthetic `id` column (every generated model has
	 * a real `id` primary key, but it's never one of Model_Fields' own
	 * user-defined fields -- `id` is reserved, see Model_Fields::
	 * RESERVED_NAMES), the same way `get_columns()` always leads with a
	 * post type's own `ID`.
	 *
	 * `isFilterable`/`facetType` mirror the same UX judgment
	 * FILTERABLE_CORE_COLUMNS/get_meta_columns() already make for post
	 * columns, applied via each field's own `Field_Type` (something a post
	 * type's meta columns don't have -- see get_meta_columns()'s own
	 * docblock for why *that* method can't narrow by type): a field type
	 * that declares itself not `is_filterable()` at all (`Password_Field_Type`,
	 * a secret value with no legitimate reason to be searchable/facetable;
	 * `Relate_To_One_Field_Type`/`Relate_To_Many_Field_Type`, whose own
	 * stored value -- a bare id, or nothing at all -- was never a
	 * meaningful thing to facet by) is never filterable at all -- a field
	 * type declares this about itself (`Field_Type::is_filterable()`)
	 * rather than this method hardcoding a per-type exclusion list of its
	 * own that every new type would need to remember to be added to. Of
	 * the ones that ARE filterable, a TextArea field is still free text,
	 * `['input']` only, the same "a Select of every distinct value would
	 * be unusable" reasoning `post_content`/`post_excerpt` already get;
	 * every other filterable type (Text, Number, Range, Email, URL, and
	 * any future type that doesn't opt out) gets the full `['input',
	 * 'select', 'checkboxes']` vocabulary, same default as post meta.
	 * `Facet_Query::apply_collection_facets()` is what actually applies
	 * one of these to an Eloquent query -- the Collection counterpart to
	 * `apply_facets()`.
	 *
	 * `isTextRenderable` is the same "a field type declares this about
	 * itself" pattern, this time via `Field_Type::is_text_renderable()`
	 * -- what `gateway/card-field-text` reads to decide which fields its
	 * own Field picker offers at all, and to reject a stale/hand-crafted
	 * `fieldKey` on the front end that its own picker would never have
	 * offered (`false` for a Password field, whose secret value has no
	 * business being printed as public text, and for a Relate to One/
	 * Relate to Many field, whose own raw value is a bare id or, for
	 * Relate to Many, not even a real column at all -- see that
	 * interface method's own docblock). `true` for the synthetic `id`
	 * column and every other built-in field type.
	 *
	 * `isHtmlRenderable` is `isTextRenderable`'s own close cousin, via
	 * the separate `Field_Type::is_html_renderable()` (see that method's
	 * own docblock for why it isn't just folded into `isTextRenderable`
	 * itself) -- `true` only for a WYSIWYG field, `gateway/card-field-text`'s
	 * own SECOND eligibility signal: its Field picker offers a field
	 * whenever EITHER this or `isTextRenderable` is `true`, and its own
	 * render.php/edit.js check this specifically to print the resolved
	 * value as real, trusted HTML instead of escaping it into visible
	 * literal tags.
	 *
	 * `isNumeric` is the same pattern again, via `Field_Type::is_numeric()`
	 * -- what `gateway/card-field-number`'s own Field picker (and
	 * `gateway/datatable`'s own per-column Number Format button) reads to
	 * decide which fields are eligible at all, and what
	 * `blocks/card-field-number/render.php`/`blocks/datatable-body/render.php`
	 * both re-check before ever running `Number_Formatter::format()` on a
	 * value -- `true` only for Number/Range, `false` for the synthetic
	 * `id` column (an identifier, not a quantity a Currency/Percent
	 * format would ever make sense on) and every other built-in type.
	 *
	 * `isImage` reuses the EXISTING `Field_Type::supports_media_settings()`
	 * flag rather than introducing a new one -- already `true` for exactly
	 * one built-in type (`Image_Field_Type`; `File_Field_Type` has its own,
	 * separate `supports_file_settings()`), the same thing "is this an
	 * image field" needs to mean. `gateway/card-field-image`'s own Field
	 * picker reads it the same way `gateway/card-field-number` reads
	 * `isNumeric`. `returnFormat` rides alongside it -- the field's own
	 * configured `settings.return_format` ('array'/'url'/'id', same
	 * default `Model_Fields::sanitize_settings()` uses) -- meaningless for
	 * any other type, but harmless to compute unconditionally the same way
	 * `facetType` already is for a non-filterable field. `render.php`
	 * detects this to decide how to resolve the field's own raw stored
	 * attachment id (always a bare id in the database regardless of this
	 * setting -- `return_format` only ever shapes what a REST *consumer*
	 * sees) and whether a Size setting makes sense at all: 'array'/'id'
	 * both ultimately resolve from the same real attachment id, so either
	 * can look up any registered size; 'url' is a flat string with no id
	 * to look a different size up from at all, so that's the one case with
	 * no Size control to offer.
	 *
	 * `isOrderable` is the same "a field type declares this about itself"
	 * pattern once more, via `Field_Type::is_orderable()` -- what
	 * `gateway/data-display`'s own Order By pickers (one for its Parent
	 * collection, one for its Child/related collection) read to decide
	 * which fields to offer at all, and what `Model_Fields::
	 * resolve_orderby()` re-checks server-side before that block's own
	 * render.php ever runs an `ORDER BY` against one -- `true` for the
	 * synthetic `id` column and every built-in type `is_filterable()`
	 * also is, `false` everywhere `is_filterable()` also is (see that
	 * interface method's own docblock for why the two are separate
	 * methods despite agreeing on every built-in type today).
	 *
	 * @param string $class_name Model class name.
	 * @return array[] Column definitions, or [] if $class_name isn't a
	 *                  real, registered model.
	 */
	public static function get_columns_for_collection( $class_name ) {
		if ( ! Model_Registry::has( $class_name ) || ! class_exists( $class_name ) ) {
			return array();
		}

		$columns = array(
			array(
				'key'              => 'id',
				'label'            => __( 'ID', 'gateway' ),
				'type'             => 'model_id',
				'isFilterable'     => true,
				// Free-text/exact only -- a Select of every distinct id
				// would be unusable, same reasoning as core `ID`.
				'facetType'        => array( 'input' ),
				'isTextRenderable' => true,
				'isHtmlRenderable' => false,
				// Technically a number, but never meant for
				// gateway/card-field-number's own Currency/Percent
				// formatting -- an id is an identifier, not a quantity.
				'isNumeric'        => false,
				'isImage'          => false,
				// A real, meaningful thing to sort by -- see
				// Field_Type::is_orderable()'s own docblock for why this
				// synthetic column is always true here, the same
				// long-standing default every model's own id already got
				// before this flag existed at all.
				'isOrderable'      => true,
				// A bare integer id is neither Markdown source nor
				// anything gateway/card-field-markdown's own Field picker
				// would ever offer.
				'isMarkdownRenderable' => false,
			),
		);

		foreach ( Model_Fields::all( $class_name ) as $field ) {
			$type_class             = Field_Type_Registry::get( $field['type'] );
			$is_filterable          = $type_class && class_exists( $type_class ) && $type_class::is_filterable();
			$is_orderable           = $type_class && class_exists( $type_class ) && $type_class::is_orderable();
			$is_text_renderable     = $type_class && class_exists( $type_class ) && $type_class::is_text_renderable();
			// gateway/card-field-text's own second eligibility signal --
			// see Field_Type::is_html_renderable()'s own docblock for why
			// this is a separate flag from is_text_renderable rather than
			// folded into it (true only for WYSIWYG_Field_Type today).
			$is_html_renderable     = $type_class && class_exists( $type_class ) && $type_class::is_html_renderable();
			// gateway/card-field-markdown's own SOLE eligibility signal --
			// see Field_Type::is_markdown_renderable()'s own docblock for
			// why this is a third, separate flag rather than folded into
			// either of the two immediately above (true only for
			// Markdown_Field_Type today).
			$is_markdown_renderable = $type_class && class_exists( $type_class ) && $type_class::is_markdown_renderable();
			$is_numeric             = $type_class && class_exists( $type_class ) && $type_class::is_numeric();
			// Reuses the EXISTING supports_media_settings() flag rather
			// than a new one -- it's already true for exactly one
			// built-in type (Image_Field_Type; File_Field_Type has its
			// own, separate supports_file_settings()), the same thing
			// "is this an image field" needs to mean. See
			// gateway/card-field-image's own render.php/edit.js, both of
			// which read this (as `isImage`) the same way
			// gateway/card-field-number reads `isNumeric`.
			$is_image               = $type_class && class_exists( $type_class ) && $type_class::supports_media_settings();
			// The field's own configured Return Format
			// (Image_Field_Type::supports_media_settings()'s own
			// `settings.return_format`, 'array'/'url'/'id' -- same
			// default Model_Fields::sanitize_settings() and
			// FieldEditor.jsx's own <select> both already use) --
			// meaningless for any other type, but harmless to compute
			// unconditionally the same way facetType already is.
			// gateway/card-field-image detects this to decide how to
			// resolve the field's own raw stored attachment id (and
			// whether a Size setting makes sense at all -- see that
			// block's own render.php/edit.js for the full "why").
			$return_format          = $field['settings']['return_format'] ?? 'array';
			// Text_Area_Field_Type's own `settings.new_lines` (`''`/`'br'`/
			// `'wpautop'`) -- meaningless for any other type, but harmless
			// to compute unconditionally, same reasoning `returnFormat`
			// just above already gives. This is what actually lets a
			// SPECIFIC field's own setting (not this TYPE's own static
			// `is_html_renderable()`, which stays `false` for every Text
			// Area field regardless) decide, per field instance, whether
			// gateway/card-field-text's own render.php prints its value as
			// real HTML (`nl2br()`/`wpautop()` applied) or plain escaped
			// text -- see that type's own presentation_fields() docblock.
			$new_lines              = $field['settings']['new_lines'] ?? '';

			$facet_type = array();

			if ( $is_filterable ) {
				// A Permalink field's own value is unique per record by
				// construction (Records_REST_Controller::resolve_permalink_value()
				// enforces that unconditionally) -- a Select/Checkboxes
				// facet listing every distinct slug would be exactly as
				// unusable as it already is for TextArea/post content.
				$facet_type = in_array( $field['type'], array( 'textarea', 'permalink' ), true )
					? array( 'input' )
					: array( 'input', 'select', 'checkboxes' );
			}

			/**
			 * Filters which UI types (subset of 'input'/'select'/
			 * 'checkboxes') a model field offers as a facet -- and
			 * whether it's filterable at all (an empty array). Mirrors
			 * `gateway_datatable_meta_facet_type` for post meta.
			 *
			 * @param string[] $facet_type Allowed UI types.
			 * @param array    $field      Model_Fields::all()'s own entry (name, label, type, position).
			 * @param string   $class_name Model class name.
			 */
			$facet_type = apply_filters( 'gateway_datatable_collection_facet_type', $facet_type, $field, $class_name );

			$columns[] = array(
				'key'                  => $field['name'],
				'label'                => $field['label'],
				'type'                 => 'model_field',
				'isFilterable'         => ! empty( $facet_type ),
				'facetType'            => array_values( $facet_type ),
				'isTextRenderable'     => $is_text_renderable,
				'isHtmlRenderable'     => $is_html_renderable,
				// gateway/card-field-markdown's own Field picker reads
				// this to decide which fields to offer at all -- see
				// Field_Type::is_markdown_renderable()'s own docblock.
				'isMarkdownRenderable' => $is_markdown_renderable,
				'isNumeric'            => $is_numeric,
				'isImage'              => $is_image,
				'returnFormat'         => $return_format,
				'newLines'             => $new_lines,
				// gateway/data-display's own Order By pickers (one for its
				// Parent collection, one for its Child/related collection)
				// read this to decide which fields to offer at all -- see
				// Field_Type::is_orderable()'s own docblock.
				'isOrderable'          => $is_orderable,
			);
		}

		foreach ( self::get_related_columns_for_collection( $class_name ) as $related_column ) {
			$columns[] = $related_column;
		}

		return $columns;
	}

	/**
	 * A model's own fields aren't the only thing worth showing in a Data
	 * Table/Data Cards block -- if it `hasOne`/`belongsTo` another model,
	 * that related record's own fields are just as renderable (e.g. a
	 * Ticket `belongsTo` Event: showing the Event's own "venue_name" right
	 * on the Ticket's row/card, no separate Event grid needed). Only
	 * `hasOne`/`belongsTo` qualify -- both already treated as "a single
	 * related record" elsewhere in this codebase (`Model_Relationships::
	 * TYPES`' own `plural` flag is `false` for exactly these two); a
	 * `hasMany`/`belongsToMany` relationship has no single record to pull
	 * one column's worth of value from (that's what Relate to Many's own
	 * `[{id,label}, ...]` shape is for, a fundamentally different display).
	 *
	 * One level deep only, by design: a related field that's itself a
	 * Relate to One/Many field is skipped rather than followed to
	 * `related_model`'s own related model -- multi-hop nesting is real,
	 * separate complexity this pass doesn't take on. A related Password
	 * field is skipped outright (`is_sensitive()`) -- never surfaced as
	 * another model's own "readable" column.
	 *
	 * Deliberately `isFilterable => false` for every one of these, for
	 * now: `Facet_Query::apply_collection_facets()`/`apply_facets()` only
	 * ever filter `$class_name`'s own table -- teaching either one to
	 * filter through a relationship (a JOIN, or a `whereHas()`) is real,
	 * separate, undone work, so these never appear in a Facets panel yet,
	 * only as plain display columns/fields.
	 *
	 * `key` is `"{$relationship_method}.{$related_field_name}"` (e.g.
	 * `"event.venue_name"`) -- resolved back into an actual value by
	 * `resolve_collection_value()`, and what a caller needs to eager-load
	 * (`->with( $relationship_method )`) before that resolution can work
	 * without an N+1 query per row.
	 *
	 * @param string $class_name Model class name.
	 * @return array[] Column definitions -- [] if $class_name has no
	 *                  qualifying relationships.
	 */
	public static function get_related_columns_for_collection( $class_name ) {
		$columns = array();

		foreach ( Model_Relationships::all( $class_name ) as $relationship ) {
			if ( ! in_array( $relationship['type'], array( 'hasOne', 'belongsTo' ), true ) ) {
				continue;
			}

			$related_model = $relationship['related_model'];

			if ( ! Model_Registry::has( $related_model ) || ! class_exists( $related_model ) ) {
				continue;
			}

			$related_label = Model_Builder::get_plural_title( $related_model );
			$related_label = '' !== $related_label ? $related_label : $related_model;

			foreach ( Model_Fields::all( $related_model ) as $related_field ) {
				// One level deep only -- see this method's own docblock.
				if ( null !== $related_field['relationship_method'] ) {
					continue;
				}

				$related_type_class = Field_Type_Registry::get( $related_field['type'] );
				$is_sensitive       = $related_type_class && class_exists( $related_type_class ) && $related_type_class::is_sensitive();

				if ( $is_sensitive ) {
					continue;
				}

				$columns[] = array(
					'key'                  => $relationship['method_name'] . '.' . $related_field['name'],
					'label'                => $related_label . ': ' . $related_field['label'],
					'type'                 => 'model_related_field',
					'isFilterable'         => false,
					'facetType'            => array(),
					// Same reasoning as isFilterable above -- neither
					// Facet_Query nor (now) gateway/data-display's own
					// Order By pickers can filter/sort THROUGH a
					// relationship, only against $class_name's own table.
					'isOrderable'          => false,
					// False only for a related WYSIWYG field today (see
					// isHtmlRenderable below for that one instead) -- the
					// "one level deep only" skip above already excludes a
					// related field that's itself a relate field, and the
					// is_sensitive() skip already excludes Password.
					'isTextRenderable'     => $related_type_class && class_exists( $related_type_class ) && $related_type_class::is_text_renderable(),
					// Same isHtmlRenderable flag gateway/card-field-text's
					// own Field picker/render.php already check for a
					// model's OWN fields, just against a related model's
					// field instead -- true only for a related WYSIWYG
					// field.
					'isHtmlRenderable'     => $related_type_class && class_exists( $related_type_class ) && $related_type_class::is_html_renderable(),
					// Same treatment again -- gateway/card-field-markdown's
					// own Field picker offers a related model's own
					// Markdown field the exact same "one level deep only"
					// way gateway/card-field-text already offers a related
					// WYSIWYG/plain-text field.
					'isMarkdownRenderable' => $related_type_class && class_exists( $related_type_class ) && $related_type_class::is_markdown_renderable(),
					'isNumeric'            => $related_type_class && class_exists( $related_type_class ) && $related_type_class::is_numeric(),
					'isImage'              => $related_type_class && class_exists( $related_type_class ) && $related_type_class::supports_media_settings(),
					'returnFormat'         => $related_field['settings']['return_format'] ?? 'array',
					// Same reasoning as get_columns_for_collection()'s own
					// identical `newLines` key above, just for a related
					// Text Area field instead of one of this model's own.
					'newLines'             => $related_field['settings']['new_lines'] ?? '',
					'relationship_method'  => $relationship['method_name'],
				);
			}
		}

		return $columns;
	}

	/**
	 * Resolves one Collection column's actual value off a real Eloquent
	 * record -- a plain `$record->{$key}` for one of the model's own
	 * fields, or, for a related field (`get_related_columns_for_collection()`'s
	 * own `"{$relationship_method}.{$related_field_name}"` key shape),
	 * the related record's own field value instead. Used anywhere a
	 * Collection's own column/field value is read for display
	 * (`gateway/datatable-body`'s cell rendering, `gateway/card-field-text`'s
	 * own value) so both share one definition of what a dotted key means,
	 * rather than each re-deriving it.
	 *
	 * Returns `null` (never errors) if the relationship isn't actually
	 * loaded/set for this record (e.g. a `belongsTo` whose FK is NULL) --
	 * callers already treat a missing value as blank, same as any other
	 * unset field.
	 *
	 * @param \Illuminate\Database\Eloquent\Model $record A real Eloquent record.
	 * @param string                                $key    Column key -- plain, or "relationship.field".
	 * @return mixed
	 */
	public static function resolve_collection_value( \Illuminate\Database\Eloquent\Model $record, $key ) {
		if ( false === strpos( $key, '.' ) ) {
			return $record->{ $key } ?? null;
		}

		list( $relationship_method, $related_field_name ) = explode( '.', $key, 2 );

		$related = $record->{ $relationship_method } ?? null;

		return $related instanceof \Illuminate\Database\Eloquent\Model
			? ( $related->{ $related_field_name } ?? null )
			: null;
	}

	/**
	 * Clear the cached column list for a post type (e.g. after registering
	 * new meta at runtime and wanting it to show up immediately).
	 *
	 * @param string $post_type Post type slug.
	 */
	public static function flush_cache( $post_type ) {
		delete_transient( 'gwdt_cols_' . $post_type . '_' . self::get_cache_version() );
	}

	/**
	 * A short identifier that changes whenever this file's discovery logic
	 * does, folded into the cache key in get_columns()/flush_cache().
	 *
	 * Without this, a transient created under an older version of this
	 * file's logic (e.g. before a column-discovery bug was fixed, or an
	 * exclusion was added) has no way to know it's now stale -- it would
	 * keep being served as-is until its TTL happens to expire or a matching
	 * save_post fires, neither of which is triggered by deploying new code.
	 * Keying the cache to this file's own mtime means a code change to the
	 * discovery logic invalidates every previously-cached column list
	 * immediately, with no explicit "flush everything" step required.
	 *
	 * @return string
	 */
	protected static function get_cache_version() {
		static $version;

		if ( null === $version ) {
			$version = substr( md5( GATEWAY_VERSION . '|' . filemtime( __FILE__ ) ), 0, 12 );
		}

		return $version;
	}

	/**
	 * Core WP_Post fields worth offering as columns, with friendly labels.
	 *
	 * @param string $post_type Post type slug.
	 * @return array[]
	 */
	protected static function get_core_columns( $post_type ) {
		/**
		 * Filters the core (WP_Post field) columns offered for a post type.
		 * Keys are WP_Post property names; values are their friendly labels.
		 *
		 * @param array  $labels    Map of field key => friendly label.
		 * @param string $post_type Post type slug.
		 */
		$labels = apply_filters(
			'gateway_datatable_core_columns',
			array(
				'ID'            => __( 'ID', 'gateway' ),
				'post_title'    => __( 'Title', 'gateway' ),
				'post_content'  => __( 'Content', 'gateway' ),
				'post_excerpt'  => __( 'Excerpt', 'gateway' ),
				'post_date'     => __( 'Date', 'gateway' ),
				'post_modified' => __( 'Modified', 'gateway' ),
				'post_author'   => __( 'Author', 'gateway' ),
				'post_status'   => __( 'Status', 'gateway' ),
				'post_name'     => __( 'Slug', 'gateway' ),
				'post_parent'   => __( 'Parent ID', 'gateway' ),
				'menu_order'    => __( 'Order', 'gateway' ),
				'comment_count' => __( 'Comments', 'gateway' ),
			),
			$post_type
		);

		// "Parent ID" only makes sense for hierarchical post types (pages,
		// and any custom hierarchical CPT) -- post_parent isn't meaningful
		// for posts or other flat post types, so don't offer it as a column
		// for them.
		if ( ! is_post_type_hierarchical( $post_type ) ) {
			unset( $labels['post_parent'] );
		}

		/**
		 * Filters which core columns are offered as facets, and with which
		 * UI types -- see FILTERABLE_CORE_COLUMNS's own docblock for the
		 * reasoning behind the defaults. Map of field key => array of
		 * 'input'/'select'/'checkboxes'; a key absent here is not
		 * filterable at all.
		 *
		 * @param array  $filterable_core_columns Map of field key => allowed UI types.
		 * @param string $post_type               Post type slug.
		 */
		$filterable_core_columns = apply_filters(
			'gateway_datatable_filterable_core_columns',
			self::FILTERABLE_CORE_COLUMNS,
			$post_type
		);

		$columns = array();

		foreach ( $labels as $key => $label ) {
			$facet_type = isset( $filterable_core_columns[ $key ] ) && is_array( $filterable_core_columns[ $key ] )
				? array_values( $filterable_core_columns[ $key ] )
				: array();

			$columns[] = array(
				'key'          => $key,
				'label'        => $label,
				'type'         => 'core',
				'isFilterable' => ! empty( $facet_type ),
				'facetType'    => $facet_type,
			);
		}

		return $columns;
	}

	/**
	 * The Featured Image column, if this post type actually supports
	 * thumbnails (`add_theme_support( 'post-thumbnails' )`, opted into
	 * per-post-type same as core does) -- offering it for a type that
	 * doesn't would just produce an always-empty column, so it's left out
	 * entirely rather than shown and silently doing nothing. A single
	 * -item array (not a boolean or null) purely so `get_columns()` can
	 * fold it into the same `array_merge()` as every other column source.
	 *
	 * Its own `type` (`'thumbnail'`) -- distinct from `'core'`, even though
	 * it displays a `WP_Post` property in the broad sense -- is what tells
	 * `get_cell_value()` to return pre-rendered `<img>` markup instead of a
	 * plain string, and `render.php` to `echo` that markup directly rather
	 * than `esc_html()`-wrapping it (which would print the tag as literal
	 * text instead of rendering the image). `isFilterable => false` opts
	 * this column out of every Facets picker entirely -- filtering a grid
	 * by which rows happen to have a particular image doesn't mean
	 * anything.
	 *
	 * @param string $post_type Post type slug.
	 * @return array[] Empty, or a single-item array.
	 */
	protected static function get_thumbnail_column( $post_type ) {
		if ( ! post_type_supports( $post_type, 'thumbnail' ) ) {
			return array();
		}

		return array(
			array(
				'key'          => 'featured_image',
				'label'        => __( 'Featured Image', 'gateway' ),
				'type'         => 'thumbnail',
				'isFilterable' => false,
				'facetType'    => array(),
			),
		);
	}

	/**
	 * Taxonomy columns available for a post type: every taxonomy registered
	 * for it (categories, tags, and any custom taxonomy) that's `public` --
	 * a site-visitor-facing grid/facet shouldn't default to offering an
	 * internal-only taxonomy's terms. Unlike meta, this is a pure
	 * registration lookup (no "in use" sampling, no cache-staleness
	 * concern) since taxonomy registration is static and authoritative.
	 *
	 * Always `isFilterable => true, facetType => ['select', 'checkboxes']`
	 * -- `Facet_Query::apply_facets()`'s taxonomy branch is a `tax_query`
	 * IN/NOT-IN by term slug only, no free-text ("input") mode.
	 *
	 * @param string $post_type Post type slug.
	 * @return array[]
	 */
	protected static function get_taxonomy_columns( $post_type ) {
		$taxonomies = get_object_taxonomies( $post_type, 'objects' );
		$columns    = array();

		foreach ( $taxonomies as $taxonomy ) {
			if ( empty( $taxonomy->public ) ) {
				continue;
			}

			$columns[] = array(
				'key'          => $taxonomy->name,
				'label'        => $taxonomy->label,
				'type'         => 'taxonomy',
				'isFilterable' => true,
				'facetType'    => array( 'select', 'checkboxes' ),
			);
		}

		/**
		 * Filters the taxonomy columns offered for a post type.
		 *
		 * @param array  $columns   Taxonomy column definitions.
		 * @param string $post_type Post type slug.
		 */
		return apply_filters( 'gateway_datatable_taxonomy_columns', $columns, $post_type );
	}

	/**
	 * Meta columns available for a post type: formally registered meta
	 * (register_post_meta() -- including anything ACF registers this way
	 * when a field group's "Show in REST API" setting is turned on) merged
	 * with meta keys actually found on a recent sample of posts of this
	 * type (to also surface fields, including ACF's, that were never
	 * formally registered -- the common case). WordPress core only,
	 * deliberately: no ACF (or any other plugin's) API is called directly,
	 * so this works identically whether or not ACF -- or any specific
	 * field-builder plugin -- is even active. Protected meta (WordPress'
	 * "starts with an underscore" convention -- also how ACF stores its
	 * internal field-key references) is excluded, as are a handful of
	 * WordPress-internal meta keys that would otherwise slip through (see
	 * get_excluded_meta_keys()).
	 *
	 * @param string $post_type Post type slug.
	 * @return array[]
	 */
	protected static function get_meta_columns( $post_type ) {
		$meta_keys = array();

		foreach ( array_keys( get_registered_meta_keys( 'post', $post_type ) ) as $key ) {
			$meta_keys[ $key ] = true;
		}

		// get_registered_meta_keys() does an *exact* object_subtype match --
		// meta registered without one (register_meta( 'post', $key, $args )
		// with no 'object_subtype', which applies it to every post type) is
		// filed under the empty-string subtype and is otherwise invisible to
		// the per-post-type lookup above.
		foreach ( array_keys( get_registered_meta_keys( 'post', '' ) ) as $key ) {
			$meta_keys[ $key ] = true;
		}

		foreach ( self::get_used_meta_keys( $post_type ) as $key ) {
			$meta_keys[ $key ] = true;
		}

		$excluded_keys = self::get_excluded_meta_keys( $post_type );
		$columns       = array();

		foreach ( array_keys( $meta_keys ) as $key ) {
			if ( '' === $key || is_protected_meta( $key, 'post' ) || in_array( $key, $excluded_keys, true ) ) {
				continue;
			}

			$columns[] = array(
				'key'   => $key,
				/**
				 * Filters the friendly label for a meta column. Meta keys
				 * have no built-in "nice name" the way core fields do, so
				 * by default this just humanizes the raw key -- sites can
				 * hook this to supply real field labels instead (e.g. for
				 * their own ACF fields).
				 *
				 * @param string $label     Humanized label.
				 * @param string $key       Raw meta key.
				 * @param string $post_type Post type slug.
				 */
				'label' => apply_filters( 'gateway_datatable_column_label', self::humanize( $key ), $key, $post_type ),
				'type'  => 'meta',
				// Always filterable, with the full UI-type vocabulary --
				// unlike core/taxonomy columns, WordPress core has no
				// reliable per-key *type* info for the common case (an
				// unregistered-but-detected meta key, most of what
				// get_used_meta_keys() surfaces below) to narrow this
				// against, so restricting it here would just be guessing.
				// A site that DOES know more about a given key (e.g. its
				// own register_post_meta() 'type' arg) can narrow it via
				// this filter.
				'isFilterable' => true,
				'facetType'    => apply_filters(
					/**
					 * Filters which UI types (subset of 'input'/'select'/
					 * 'checkboxes') a meta column offers as a facet.
					 * Defaults to all three for every meta key -- see this
					 * method's own docblock for why nothing narrows it by
					 * default.
					 *
					 * @param string[] $facet_type Allowed UI types.
					 * @param string   $key        Raw meta key.
					 * @param string   $post_type  Post type slug.
					 */
					'gateway_datatable_meta_facet_type',
					array( 'input', 'select', 'checkboxes' ),
					$key,
					$post_type
				),
			);
		}

		usort(
			$columns,
			static function ( $a, $b ) {
				return strcasecmp( $a['label'], $b['label'] );
			}
		);

		return $columns;
	}

	/**
	 * Meta keys actually in use on posts of this type, via get_post_meta()
	 * on a recent sample -- rather than a hand-written SQL scan of
	 * wp_postmeta, this uses only core APIs: get_posts() to pick the
	 * sample, update_meta_cache() to prime it in one batched query (the
	 * same priming WP_Query itself normally does), then get_post_meta()
	 * per post (cheap array reads against that now-primed cache, not
	 * additional queries).
	 *
	 * Deliberately a *sample* (most recently modified posts first, capped
	 * -- see the filter below) rather than every post of the type: for a
	 * post type with many posts, discovering "what meta keys exist" this
	 * way needs to stay cheap enough to run from an admin screen. A key
	 * used on any reasonably-recently-touched post will surface; one that
	 * exists solely on posts entirely outside the sample won't, until one
	 * of them is next saved (which also busts the cache -- see init()).
	 *
	 * @param string $post_type Post type slug.
	 * @return string[] Meta keys found.
	 */
	protected static function get_used_meta_keys( $post_type ) {
		$post_ids = get_posts(
			array(
				'post_type'      => $post_type,
				'post_status'    => 'any',
				/**
				 * Filters how many of a post type's most recently modified
				 * posts are scanned for in-use meta keys.
				 *
				 * @param int    $sample_size Number of posts to scan.
				 * @param string $post_type   Post type slug.
				 */
				'posts_per_page' => apply_filters( 'gateway_datatable_meta_scan_sample_size', 200, $post_type ),
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);

		if ( ! $post_ids ) {
			return array();
		}

		update_meta_cache( 'post', $post_ids );

		$keys = array();

		foreach ( $post_ids as $post_id ) {
			foreach ( array_keys( get_post_meta( $post_id ) ) as $key ) {
				$keys[ $key ] = true;
			}
		}

		return array_keys( $keys );
	}

	/**
	 * Meta keys that are technically real, unprotected post meta but are
	 * WordPress core's or a plugin's own internals rather than actual
	 * content -- not offered as columns even though they'd otherwise pass
	 * the "not protected" check (they don't start with an underscore).
	 *
	 * @param string $post_type Post type slug.
	 * @return string[]
	 */
	protected static function get_excluded_meta_keys( $post_type ) {
		/**
		 * Filters meta keys excluded from the column picker despite not
		 * being "protected" meta.
		 *
		 * @param string[] $excluded_keys Excluded meta keys.
		 * @param string   $post_type     Post type slug.
		 */
		return apply_filters(
			'gateway_datatable_excluded_meta_keys',
			array(
				// The block editor's Footnotes feature: WordPress core
				// itself register_post_meta()'s this (show_in_rest, so the
				// editor can save it) for any post type supporting the
				// block editor -- it's real meta, but editor internals, not
				// content a site owner would want as a grid column.
				'footnotes',
			),
			$post_type
		);
	}

	/**
	 * Turn a raw key like "event_start_date" into "Event Start Date".
	 *
	 * @param string $key Raw key.
	 * @return string
	 */
	protected static function humanize( $key ) {
		return ucwords( str_replace( array( '_', '-' ), ' ', $key ) );
	}

	/**
	 * Render a single column's value for a post, as a plain display string
	 * (already appropriate to escape and output -- callers still need to
	 * esc_html() it, this just resolves *what* to show) -- **except** for
	 * `'thumbnail'`, the one column type this returns already-rendered,
	 * already-escaped `<img>` markup for instead: `esc_html()`-ing that
	 * would print the tag as literal text rather than rendering the
	 * image. `render.php` special-cases that one type specifically to
	 * `echo` it unescaped -- see its own comment there.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $column  Column definition from get_columns()/get_column().
	 * @return string
	 */
	public static function get_cell_value( $post_id, array $column ) {
		if ( 'thumbnail' === $column['type'] ) {
			return self::get_thumbnail_html( $post_id );
		}

		if ( 'meta' === $column['type'] ) {
			$value = get_post_meta( $post_id, $column['key'], true );
			return self::stringify( $value );
		}

		if ( 'taxonomy' === $column['type'] ) {
			$terms = get_the_terms( $post_id, $column['key'] );

			if ( empty( $terms ) || is_wp_error( $terms ) ) {
				return '';
			}

			// Comma-joined term names, for display. What a facet actually
			// searches against is separate -- see get_cell_filter_value().
			return implode( ', ', wp_list_pluck( $terms, 'name' ) );
		}

		switch ( $column['key'] ) {
			case 'post_title':
				$title = get_the_title( $post_id );
				return '' !== $title ? $title : __( '(no title)', 'gateway' );

			case 'post_content':
				return wp_trim_words( wp_strip_all_tags( get_post_field( 'post_content', $post_id ) ), 20 );

			case 'post_excerpt':
				return wp_strip_all_tags( get_the_excerpt( $post_id ) );

			case 'post_date':
			case 'post_modified':
				$raw = get_post_field( $column['key'], $post_id );
				return $raw ? mysql2date( get_option( 'date_format' ), $raw ) : '';

			case 'post_author':
				return get_the_author_meta( 'display_name', get_post_field( 'post_author', $post_id ) );

			case 'post_status':
				$status_object = get_post_status_object( get_post_status( $post_id ) );
				return $status_object ? $status_object->label : get_post_status( $post_id );

			default:
				return self::stringify( get_post_field( $column['key'], $post_id ) );
		}
	}

	/**
	 * A post's featured image, as ready-to-output `<img>` markup -- or an
	 * empty string if it doesn't have one. `get_the_post_thumbnail()`
	 * already produces fully-escaped markup (it's a thin wrapper over
	 * `wp_get_attachment_image()`), so nothing further needs escaping here
	 * or by callers.
	 *
	 * `'thumbnail'` (WordPress' smallest registered image size, cropped to
	 * a fixed square) rather than `'full'`/`'medium'`: this is a grid cell,
	 * not a featured-image display -- a full-resolution image would blow
	 * out both row height and page weight for no benefit here.
	 *
	 * @param int $post_id Post ID.
	 * @return string
	 */
	public static function get_thumbnail_html( $post_id ) {
		if ( ! has_post_thumbnail( $post_id ) ) {
			return '';
		}

		return get_the_post_thumbnail(
			$post_id,
			'thumbnail',
			array( 'class' => 'gateway-datatable-thumbnail' )
		);
	}

	/**
	 * What a facet actually matches a cell against -- rendered onto the
	 * `<td>` as the `data-filter` attribute DataTables' DOM-sourced tables
	 * automatically detect and search against instead of the cell's
	 * rendered HTML (a documented, built-in mechanism: no extra `columns[]`
	 * config needed, applies to both the global search box and
	 * `column().search()`).
	 *
	 * This exists because get_cell_value() -- the *display* string -- often
	 * isn't the same as the *raw* value get_facet_options() offers as a
	 * Select/Checkboxes option: `post_title` is filtered through
	 * `get_the_title()`, `post_date` through `mysql2date()`, `post_author`
	 * resolves an ID to a display name, `post_status` resolves a slug to a
	 * label, and a taxonomy cell shows term *names* while facets match by
	 * *slug*. Without this, selecting an option a visitor was just shown
	 * could fail to match the very cell it came from -- exactly the bug
	 * this method fixes (matching against rendered/filtered display text
	 * instead of the raw value the option's `value` attribute holds).
	 *
	 * Returns every value worth matching -- the raw field/slug *and* the
	 * display text, when they differ -- as a comma-joined list (the same
	 * list-item convention a multi-term taxonomy cell already uses), so
	 * both an exact-match facet (raw value) and the plain "Search:" box
	 * (someone typing what they see on screen) keep working.
	 *
	 * @param int   $post_id Post ID.
	 * @param array $column  Column definition from get_columns()/get_column().
	 * @return string
	 */
	public static function get_cell_filter_value( $post_id, array $column ) {
		if ( 'thumbnail' === $column['type'] ) {
			// No text content to search against (the cell is an <img>, not
			// a string) -- the attachment's own alt text, if set, is the
			// one thing worth matching a visitor's search against; empty
			// otherwise, which just means this column never matches a
			// search term, not that it errors.
			$attachment_id = get_post_thumbnail_id( $post_id );
			return $attachment_id
				? get_post_meta( $attachment_id, '_wp_attachment_image_alt', true )
				: '';
		}

		if ( 'taxonomy' === $column['type'] ) {
			$terms = get_the_terms( $post_id, $column['key'] );

			if ( empty( $terms ) || is_wp_error( $terms ) ) {
				return '';
			}

			return self::join_tokens(
				array_merge(
					wp_list_pluck( $terms, 'slug' ),
					wp_list_pluck( $terms, 'name' )
				)
			);
		}

		if ( 'meta' === $column['type'] ) {
			// No raw-vs-display split for meta -- get_cell_value() already
			// returns the unfiltered value.
			return self::get_cell_value( $post_id, $column );
		}

		// Core: get_facet_options() builds its Select/Checkboxes options
		// from a direct `SELECT DISTINCT` on this wp_posts column, i.e. the
		// unfiltered field value -- so that's the primary match target,
		// with the formatted display value folded in too when it's
		// different (so the plain search box can still find a row by what
		// it actually shows, e.g. an author's name or a formatted date).
		$raw     = self::stringify( get_post_field( $column['key'], $post_id ) );
		$display = self::get_cell_value( $post_id, $column );

		return self::join_tokens( array( $raw, $display ) );
	}

	/**
	 * Comma-join a list of candidate search tokens, dropping empties and
	 * duplicates (e.g. when a raw value and its display form are identical).
	 *
	 * @param string[] $tokens Candidate tokens.
	 * @return string
	 */
	protected static function join_tokens( array $tokens ) {
		return implode( ', ', array_values( array_unique( array_filter( $tokens, 'strlen' ) ) ) );
	}

	/**
	 * Coerce an arbitrary meta/field value into a safe display string.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	protected static function stringify( $value ) {
		if ( is_array( $value ) || is_object( $value ) ) {
			return wp_json_encode( $value );
		}

		if ( is_bool( $value ) ) {
			return $value ? __( 'Yes', 'gateway' ) : __( 'No', 'gateway' );
		}

		return (string) $value;
	}
}
