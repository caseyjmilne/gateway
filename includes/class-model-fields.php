<?php
/**
 * Field definitions for generated models -- what the admin app's Field
 * Editor (on a model's detail screen) manages. The `gateway_fields`
 * table (model, name, type -- see ensure_table()) is the one source of
 * truth: every add()/update()/remove() call writes there first, and
 * all() always reads straight back from it, never from anything cached
 * in memory or in a model's own compiled code. A model's own generated
 * getFields() method (see Model_Builder::model_template()/
 * fields_literal()) is a *materialized copy* of that same data, baked in
 * as a literal array purely so Eloquent's getFillable() has something to
 * read at runtime without this class needing to be loaded at all -- it's
 * regenerated from the table after every change, but the table, not the
 * file, is what's actually authoritative.
 *
 * This ordering -- DB row first, file second -- is deliberate: if
 * rewriting the model file ever fails (e.g. a permissions problem),
 * add()/update() still return successfully with a 'warnings' entry
 * rather than losing the change, because the field's own row is already
 * safely recorded. The very next add()/update()/remove() call on that
 * model reads the table fresh and rewrites the file again with the
 * complete, correct field list -- so a stale file self-heals the next
 * time anything about that model's fields changes, the same way it
 * already does for a model whose file predates getFields()/getFillable()
 * existing at all. resync() below exposes that same repair as its own
 * explicit operation, for when nothing else is about to change.
 *
 * Metadata is only half the story, though: every field here is meant to
 * be a real, usable Eloquent attribute, which means a real database
 * column. Every add()/update()/remove() call generates and immediately
 * runs a migration for exactly that one schema change (an ADD COLUMN,
 * RENAME COLUMN, MODIFY COLUMN, or DROP COLUMN) before the corresponding
 * metadata is ever recorded -- the two are kept in lock-step on purpose,
 * since a fillable name Eloquent doesn't know a matching column for
 * would fail on every save.
 *
 * A model's fields are stored (and returned by all()) as one flat array
 * of field arrays -- deliberately never split into parallel arrays keyed
 * by property (no {names: [...], types: [...]} shape): two fields simply
 * sit as neighbors in the same array, each one a plain {name, label,
 * type, position}. This is also exactly the shape a model's own
 * getFillable() override needs: array_column( getFields(), 'name' ).
 *
 * `label` is purely a display string -- unlike name/type, changing it
 * never touches the schema (no column to rename, nothing to migrate):
 * it exists so a field can be retitled for display (e.g. correcting a
 * typo, or just preferring different wording) without the real
 * consequences a genuine column rename carries. Left blank when adding
 * or editing a field, it defaults to a title-cased version of the name
 * (Illuminate\Support\Str::headline() -- "first_name" becomes "First
 * Name"), including for a row recorded before this column existed (see
 * all()'s own fallback for that).
 *
 * `position` orders the array -- all() always queries ORDER BY position
 * (id as a tiebreak, so a table full of legacy rows that all share
 * position 0 still sorts by insertion order, same as before this column
 * existed). A new field is appended (current max position + 1); nothing
 * else ever changes another field's position except reorder(), which
 * exists for exactly that: a straight metadata write, no migration,
 * whatever order the Field Editor's own sortable list says.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Fields {

	/**
	 * Table name (unprefixed -- Capsule's own connection config already
	 * applies $wpdb->prefix, same as every generated model's table, so
	 * this really is e.g. "wp_gateway_fields").
	 */
	const TABLE = 'gateway_fields';

	/**
	 * Column names every generated model's own initial migration already
	 * creates -- never valid as a field name, since that would collide
	 * with a real column create()/Model_Builder's own migration already
	 * added.
	 */
	const RESERVED_NAMES = array( 'id', 'created_at', 'updated_at' );

	/**
	 * Creates the gateway_fields table if it doesn't already exist --
	 * normally done once by gateway_activate() on plugin activation (see
	 * gateway.php), but also called defensively here before every read/
	 * write in this class, the same "also do it lazily, don't just trust
	 * activation ran" trade-off Model_Builder::ensure_directories() (its
	 * filesystem counterpart) already accepts -- covers a site upgrading
	 * from a version of this plugin that predates this table, where
	 * WordPress never re-fires the activation hook on its own.
	 */
	public static function ensure_table() {
		$schema = \Illuminate\Database\Capsule\Manager::schema();

		if ( ! $schema->hasTable( self::TABLE ) ) {
			$schema->create(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->id();
					$table->string( 'model' ); // Model class name, e.g. "Ticket".
					$table->string( 'name' );  // Sanitized field name -- the real column name too.
					// Nullable even though add()/update() never actually
					// write a blank one (validate() always fills in a
					// default) -- kept consistent with the upgrade-path
					// ALTER below, which can't backfill a real value for
					// existing rows.
					$table->string( 'label' )->nullable();
					$table->string( 'type' );  // One of Field_Type_Registry::keys().
					// Sort order for the Field Editor's own sortable list --
					// see this class's own docblock and reorder().
					$table->unsignedInteger( 'position' )->default( 0 );
					// NULL for every plain field; set only for a Relate to
					// One/Relate to Many field -- see the upgrade-path
					// ALTER below and all()'s own docblock.
					$table->string( 'relationship_method' )->nullable();
					// Whether a record can be saved with this field left
					// empty -- see the upgrade-path ALTER below and
					// validate_required_fields()'s own docblock for what
					// "empty" means per value shape.
					$table->boolean( 'required' )->default( false );
					// JSON-encoded object, arbitrary shape depending on
					// $type -- see the upgrade-path ALTER below and
					// sanitize_settings()'s own docblock for why this is
					// one generic column rather than one dedicated column
					// per possible per-type option.
					$table->text( 'settings' )->nullable();
					// JSON-encoded {enabled, groups} -- NULL when disabled
					// or never configured. Applies uniformly regardless of
					// $type (like `required`, unlike `settings`), but is a
					// genuinely nested structure (OR'd groups of AND'd
					// rules) rather than a flat set of strings, so it gets
					// its own column instead of one more `settings` key --
					// see sanitize_conditional_logic()'s own docblock.
					$table->text( 'conditional_logic' )->nullable();
					$table->timestamps();

					// Belt-and-suspenders alongside validate()'s own uniqueness
					// check below -- a duplicate (model, name) pair can never
					// land in the table even if two requests somehow raced past
					// that check at the same time.
					$table->unique( array( 'model', 'name' ) );
				}
			);

			return;
		}

		// Upgrade path for a table created by a version of this plugin that
		// predates the label column -- added nullable (existing rows get
		// NULL) since there's no real value to backfill them with; all()'s
		// own fallback covers those rows the same way it covers a brand
		// new, blank label.
		if ( ! $schema->hasColumn( self::TABLE, 'label' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->string( 'label' )->nullable();
				}
			);
		}

		// Same idea for position -- every existing row defaults to 0 (its
		// DEFAULT), so they all tie and fall back to id (insertion order)
		// in all()'s own ORDER BY, exactly the order they were already in.
		if ( ! $schema->hasColumn( self::TABLE, 'position' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->unsignedInteger( 'position' )->default( 0 );
				}
			);
		}

		// Which of this model's own relationships (Model_Relationships,
		// by method_name) a Relate to One/Relate to Many field is bound
		// to -- NULL for every plain field type. Nullable for the same
		// upgrade-path reason as label/position: an existing row (every
		// one of which predates this column, and none of which could
		// have been a relationship field before it existed) simply has
		// nothing to backfill it with.
		if ( ! $schema->hasColumn( self::TABLE, 'relationship_method' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->string( 'relationship_method' )->nullable();
				}
			);
		}

		// Same idea as position -- every existing row defaults to false
		// (its DEFAULT), which is exactly right: a field created before
		// this column existed was never actually enforced as required, so
		// treating it as "not required" is the only backfill that doesn't
		// change behavior out from under an existing site.
		if ( ! $schema->hasColumn( self::TABLE, 'required' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->boolean( 'required' )->default( false );
				}
			);
		}

		// Same upgrade-path reason as label/position/relationship_method --
		// nullable, since an existing row (predating this column) has no
		// real settings to backfill; all()'s own fallback treats a NULL
		// the same as a freshly-added field with none configured yet: `[]`.
		if ( ! $schema->hasColumn( self::TABLE, 'settings' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->text( 'settings' )->nullable();
				}
			);
		}

		// Same upgrade-path reason as every column above -- nullable, since
		// an existing row (predating this column) never had any
		// conditional logic configured at all; all()'s own fallback treats
		// a NULL the same as a freshly-added field with none configured
		// yet: `null` (never shown/hidden, always visible).
		if ( ! $schema->hasColumn( self::TABLE, 'conditional_logic' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->text( 'conditional_logic' )->nullable();
				}
			);
		}
	}

	/**
	 * @return \Illuminate\Database\Query\Builder Query builder for the
	 *              gateway_fields table.
	 */
	private static function table() {
		self::ensure_table();

		return \Illuminate\Database\Capsule\Manager::table( self::TABLE );
	}

	/**
	 * Reads a model's fields straight from the gateway_fields table --
	 * the one source of truth (see this class's own docblock). Ordered by
	 * position (id as a tiebreak -- see this class's own docblock for
	 * why), so the array's own order always matches the Field Editor's
	 * own sortable list, and that's what a model's own generated
	 * getFields() prints fields in.
	 *
	 * `relationship_method`/`related_model` are `null` for every plain
	 * field. For a Relate to One/Relate to Many field, `relationship_method`
	 * is read straight off its own row; `related_model` is resolved fresh
	 * here from Model_Relationships::find() -- not stored redundantly in
	 * this table -- so it always reflects that relationship's current
	 * `related_model`, never a stale copy (a relationship's own
	 * related_model can't actually change without removing and re-adding
	 * it, but resolving it fresh costs nothing and rules out drift by
	 * construction rather than by convention). `null` here specifically
	 * (rather than the field simply being dropped) if the field's own
	 * relationship_method no longer matches any of the model's current
	 * relationships -- shouldn't normally happen (Model_Relationships::
	 * remove() refuses to remove one a field still depends on), but
	 * degrades safely if it ever does (e.g. hand-edited data) rather than
	 * fatal-erroring on a null related_model somewhere downstream.
	 *
	 * `choices` is `[]` for every plain/relationship field, and for a
	 * Choice_Field_Type field with none configured yet -- an ordered array
	 * of strings (Model_Field_Choices::for_fields()'s own shape) for one
	 * that has some. Batch-fetched once for every field on the model in a
	 * single query (keyed by each row's own `id`), not one query per
	 * Choice_Field_Type field -- the same "one query total" reasoning
	 * relationship resolution above already follows.
	 *
	 * `required` is a plain bool -- see validate_required_fields()'s own
	 * docblock for what actually reads it and what "required" means per
	 * value shape.
	 *
	 * `settings` is `[]` for every field whose type recognizes none of
	 * the admin app's fixed presentation-settings catalog (see
	 * `Field_Type::presentation_fields()`'s own docblock), or for one
	 * that does but has none actually filled in yet -- otherwise a plain
	 * associative array, JSON-decoded straight off the row's own raw
	 * `settings` column (never re-validated against the field's own
	 * *current* type here; that already happened once, in
	 * `sanitize_settings()`, at the moment it was saved).
	 *
	 * `conditional_logic` is `null` for a field with none configured, or
	 * `{enabled: true, groups: [...]}` -- JSON-decoded straight off the
	 * row's own raw `conditional_logic` column, then passed through
	 * `prune_conditional_logic_rules()` against this SAME call's own list
	 * of current field names, dropping any rule that now references a
	 * field since renamed or removed (see that method's own docblock for
	 * why this happens here, on every read, rather than once at save
	 * time).
	 *
	 * @param string $class_name Model class name.
	 * @return array<int,array{id:int,name:string,label:string,type:string,position:int,relationship_method:?string,related_model:?string,choices:string[],required:bool,settings:array<string,string>,conditional_logic:?array}>
	 */
	public static function all( $class_name ) {
		$relationships_by_method = array();

		foreach ( Model_Relationships::all( $class_name ) as $relationship ) {
			$relationships_by_method[ $relationship['method_name'] ] = $relationship['related_model'];
		}

		$rows = self::table()
			->where( 'model', $class_name )
			->orderBy( 'position' )
			->orderBy( 'id' )
			->get( array( 'id', 'name', 'label', 'type', 'position', 'relationship_method', 'required', 'settings', 'conditional_logic' ) );

		$choices_by_field_id = Model_Field_Choices::for_fields( $rows->pluck( 'id' )->all() );
		$all_field_names     = $rows->pluck( 'name' )->all();

		return $rows
			->map(
				function ( $row ) use ( $relationships_by_method, $choices_by_field_id, $all_field_names ) {
					$relationship_method = ! empty( $row->relationship_method ) ? $row->relationship_method : null;
					$type_class          = Field_Type_Registry::get( $row->type );
					$is_choice_type      = $type_class && is_subclass_of( $type_class, Choice_Field_Type::class );

					$settings           = ! empty( $row->settings ) ? json_decode( $row->settings, true ) : array();
					$conditional_logic  = ! empty( $row->conditional_logic ) ? json_decode( $row->conditional_logic, true ) : null;
					$other_field_names  = array_values( array_diff( $all_field_names, array( $row->name ) ) );

					return array(
						'id'                   => (int) $row->id,
						'name'                 => $row->name,
						// A row recorded before the label column existed
						// (or saved with one left blank) has no label of
						// its own yet -- fall back to the same
						// auto-derived default validate() would give it.
						'label'                => ! empty( $row->label ) ? $row->label : self::default_label( $row->name ),
						'type'                 => $row->type,
						'position'             => (int) $row->position,
						'relationship_method'  => $relationship_method,
						'related_model'        => null !== $relationship_method && isset( $relationships_by_method[ $relationship_method ] )
							? $relationships_by_method[ $relationship_method ]
							: null,
						'choices'              => $is_choice_type ? ( $choices_by_field_id[ (int) $row->id ] ?? array() ) : array(),
						'required'             => (bool) $row->required,
						'settings'             => is_array( $settings ) ? $settings : array(),
						'conditional_logic'    => self::prune_conditional_logic_rules( $conditional_logic, $other_field_names ),
					);
				}
			)
			->all();
	}

	/**
	 * Prepares a single field array (one of `all()`'s own return values,
	 * or `add()`/`update()`'s) for a JSON REST response -- specifically,
	 * casts `settings` to a real PHP object (`(object)`) rather than
	 * leaving it a plain array.
	 *
	 * This is deliberately NOT done inside `all()`/`add()`/`update()`
	 * themselves: their own return values are also read internally as
	 * plain arrays by, e.g., `validate_character_limits()`/
	 * `validate_range_values()` (`$field['settings']['character_limit']`,
	 * `$field['settings']['min_value']`) -- casting `settings` to an
	 * object there would break every one of those with a fatal "cannot
	 * use object as array" the moment a field's settings happened to be
	 * empty. This helper exists so the REST controllers (the only
	 * callers that actually serialize a field to JSON) can apply the
	 * same fix at their own boundary instead, right before the array
	 * leaves PHP entirely.
	 *
	 * **Why this matters at all**: `wp_json_encode()` (like PHP's own
	 * `json_encode()`) can't tell an empty PHP array meant as a JSON
	 * object (`{}`) from one meant as a JSON array (`[]`) -- it always
	 * picks `[]` for an empty array, regardless of intent. A field with
	 * no `settings` configured yet -- i.e. every field's own settings the
	 * very first time it's opened, before anything's been typed into it
	 * -- hits exactly this case: `settings` decodes to `array()`, which
	 * then serializes as `"settings": []`, not `"settings": {}`. This was
	 * a real, previously-shipped bug, not just a theoretical one: the
	 * admin app's own `FieldEditor.jsx` seeds its react-hook-form state
	 * from `field.settings` directly (`settings: field.settings || {}`)
	 * -- since `[]` is truthy in JS, that `||` never falls through to
	 * `{}`, so the form's own `settings` value silently started life as a
	 * genuine JS ARRAY. Typing into any Presentation/General setting
	 * (`register('settings.placeholder')`, etc.) still "worked" in the
	 * sense that it set a `.placeholder` property on that array object
	 * without erroring -- JS arrays are still plain objects underneath,
	 * property assignment on one is perfectly legal -- but
	 * `JSON.stringify()` on an array ONLY ever serializes its own
	 * numeric-indexed elements, silently dropping any other named
	 * property. The autosave's own outgoing request body ended up
	 * carrying `"settings": []` again, no matter what had actually been
	 * typed -- indistinguishable, from the network tab, from the setting
	 * simply never having been typed in the first place. A field whose
	 * settings were already a genuine non-empty object (anything typed
	 * into it earlier, in an older session before this fix, or during
	 * the SAME session once at least one setting keystroke happened to
	 * autosave successfully before hitting this exact empty-first case)
	 * never exhibited this at all, which is why it read as affecting
	 * "some fields but not others" rather than as a single, consistent,
	 * always-reproducible bug.
	 *
	 * @param array $field One field array, as returned by `all()`/`add()`/
	 *                       `update()`.
	 * @return array The same array, with `settings` cast to `(object)`.
	 */
	public static function for_rest_response( array $field ) {
		$field['settings'] = (object) ( is_array( $field['settings'] ) ? $field['settings'] : array() );

		return $field;
	}

	/**
	 * Checks every one of a model's `required` fields against $data
	 * (Records_REST_Controller calls this with sanitize_record_data()'s
	 * own output, straight after casting and BEFORE extract_relate_many_data()
	 * strips a Relate to Many field's own value back out of it -- a
	 * required Relate to Many field's own selected ids still need to be
	 * checked here, and extract_relate_many_data() would otherwise have
	 * already removed the one key this method would need to see).
	 *
	 * $is_create distinguishes the two record-write paths, since they
	 * mean something different for a field the request simply doesn't
	 * mention at all: on create() every required field must actually be
	 * present (a brand new record has no existing value to fall back on);
	 * on a partial update(), a key that's simply absent is left alone --
	 * only a key that IS present but resolves to an empty value is
	 * rejected. Either way, once a key is present, "empty" means the same
	 * thing regardless of which path is checking it:
	 *
	 * - An array (Relate to Many's ids, or Checkbox's own selected
	 *   choices): empty only if `[]` -- `[0]` is a real selection.
	 * - A bool (True/False): "required" here specifically means "must be
	 *   checked" (the common "must agree to terms" meaning of a required
	 *   checkbox), so `false` counts as empty, not just `null`.
	 * - A string (Text/TextArea/Email/URL/Password, or a single-select
	 *   Choice type's own value): empty if blank *after trimming* -- a
	 *   handful of spaces has no more real content than `''` does, and
	 *   "required" exists specifically to guarantee real content.
	 * - Anything else (Number/Range, a Relate to One's own id, ...):
	 *   empty only if `null` -- `0`/`0.0` are real, present values a
	 *   required Number field must accept.
	 *
	 * A field whose own Conditional Logic evaluates to "hidden" for this
	 * record (`Model_Fields::is_field_visible_for_data()`, against
	 * `$effective_data`) is skipped entirely here, required or not -- a
	 * hidden field is treated as if it doesn't exist for this record at
	 * all, the same as a field this model doesn't have.
	 *
	 * @param string     $class_name     Model class name.
	 * @param array      $data           sanitize_record_data()'s own
	 *                                     output, not yet passed through
	 *                                     extract_relate_many_data().
	 * @param bool       $is_create      True for create_record(), false
	 *                                     for update_record().
	 * @param array|null $effective_data `[field_name => value]` used ONLY
	 *                                     to evaluate each field's own
	 *                                     Conditional Logic against (never
	 *                                     to decide whether a value itself
	 *                                     is missing -- that's still
	 *                                     $data) -- defaults to $data
	 *                                     itself (correct for create(),
	 *                                     where every field is always
	 *                                     present regardless); update()
	 *                                     passes `$record`'s own current
	 *                                     attributes merged with $data
	 *                                     instead, so a rule referencing a
	 *                                     field this particular request
	 *                                     didn't touch still evaluates
	 *                                     against that field's real,
	 *                                     already-stored value rather than
	 *                                     being unable to evaluate at all.
	 * @return true|\WP_Error
	 */
	public static function validate_required_fields( $class_name, array $data, $is_create, $effective_data = null ) {
		$effective_data = is_array( $effective_data ) ? $effective_data : $data;
		$missing_labels = array();

		foreach ( self::all( $class_name ) as $field ) {
			if ( ! $field['required'] ) {
				continue;
			}

			if ( ! self::is_field_visible_for_data( $field['conditional_logic'], $effective_data ) ) {
				continue;
			}

			if ( ! array_key_exists( $field['name'], $data ) ) {
				if ( $is_create ) {
					$missing_labels[] = $field['label'];
				}

				continue;
			}

			if ( self::is_required_value_missing( $data[ $field['name'] ] ) ) {
				$missing_labels[] = $field['label'];
			}
		}

		if ( empty( $missing_labels ) ) {
			return true;
		}

		return new \WP_Error(
			'gateway_record_missing_required_fields',
			sprintf(
				/* translators: %s: comma-separated list of field labels */
				__( 'The following required fields need a value: %s.', 'gateway' ),
				implode( ', ', $missing_labels )
			),
			array( 'status' => 400 )
		);
	}

	/**
	 * @param mixed $value An already-cast field value (sanitize_record_data()'s
	 *                       own output for one field) -- see
	 *                       validate_required_fields()'s own docblock for
	 *                       what "missing" means per value shape.
	 * @return bool
	 */
	private static function is_required_value_missing( $value ) {
		if ( is_array( $value ) ) {
			return empty( $value );
		}

		if ( is_bool( $value ) ) {
			return false === $value;
		}

		if ( is_string( $value ) ) {
			// Trimmed, not a bare '' check -- a Text/TextArea/Email/URL
			// value of "   " has no more real content than an empty
			// string does, and "required" exists specifically to
			// guarantee real content, not just "the key wasn't blank in
			// the most literal sense."
			return '' === trim( $value );
		}

		return null === $value;
	}

	/**
	 * Checks every one of a model's fields with a configured
	 * `character_limit` (`Field_Type::supports_character_limit()`,
	 * `Model_Fields::sanitize_settings()`'s own doing -- always a positive
	 * whole number by the time it's stored, never an arbitrary string)
	 * against $data, the same way validate_required_fields() checks
	 * `required` -- called by Records_REST_Controller::create_record()/
	 * update_record() right alongside it, straight after
	 * sanitize_record_data() casts the request body.
	 *
	 * Unlike validate_required_fields(), this needs no $is_create
	 * distinction: a key the request simply doesn't mention has nothing
	 * to check a length against either way, on a create or an update, so
	 * a field this method skips entirely whenever `array_key_exists()`
	 * fails is correct for both call sites without a separate case for
	 * each. Only a string value is ever checked (a `character_limit`
	 * setting only ever exists on Text_Field_Type/Text_Area_Field_Type in
	 * the first place, both plain strings) -- `mb_strlen()` when available
	 * (a multi-byte UTF-8 character is one character, not two or three,
	 * against a limit meant to describe how much a person actually typed),
	 * falling back to `strlen()` on a build without the `mbstring`
	 * extension enabled, same trade-off PHP itself expects call sites to
	 * make.
	 *
	 * A field whose own Conditional Logic evaluates to "hidden" for this
	 * record is skipped entirely here too, the same as
	 * validate_required_fields() -- see that method's own docblock for
	 * what $effective_data is and why it can differ from $data.
	 *
	 * @param string     $class_name     Model class name.
	 * @param array      $data           sanitize_record_data()'s own output.
	 * @param array|null $effective_data See validate_required_fields()'s
	 *                                     own docblock.
	 * @return true|\WP_Error
	 */
	public static function validate_character_limits( $class_name, array $data, $effective_data = null ) {
		$effective_data = is_array( $effective_data ) ? $effective_data : $data;
		$too_long       = array();

		foreach ( self::all( $class_name ) as $field ) {
			if ( ! self::is_field_visible_for_data( $field['conditional_logic'], $effective_data ) ) {
				continue;
			}

			if ( ! array_key_exists( $field['name'], $data ) ) {
				continue;
			}

			$limit = isset( $field['settings']['character_limit'] ) ? (int) $field['settings']['character_limit'] : 0;

			if ( $limit <= 0 ) {
				continue;
			}

			$value = $data[ $field['name'] ];

			if ( ! is_string( $value ) ) {
				continue;
			}

			$length = function_exists( 'mb_strlen' ) ? mb_strlen( $value ) : strlen( $value );

			if ( $length > $limit ) {
				$too_long[] = sprintf(
					/* translators: 1: field label, 2: character limit */
					__( '%1$s (limit %2$d)', 'gateway' ),
					$field['label'],
					$limit
				);
			}
		}

		if ( empty( $too_long ) ) {
			return true;
		}

		return new \WP_Error(
			'gateway_record_character_limit_exceeded',
			sprintf(
				/* translators: %s: comma-separated list of "field label (limit N)" */
				__( 'The following fields exceed their character limit: %s.', 'gateway' ),
				implode( ', ', $too_long )
			),
			array( 'status' => 400 )
		);
	}

	/**
	 * Checks every one of a model's fields with a configured `min_value`/
	 * `max_value` (`Field_Type::supports_range_limits()`, `Range_Field_Type`
	 * only today -- `Model_Fields::sanitize_settings()`'s own doing, always
	 * genuinely numeric strings by the time they're stored) against $data,
	 * the exact same shape of check `validate_character_limits()` already
	 * runs for `character_limit` -- called by `Records_REST_Controller::
	 * create_record()`/`update_record()` right alongside it.
	 *
	 * Either bound is entirely optional and independent -- a field with
	 * only a `min_value` is checked only against that, one with only a
	 * `max_value` only against that, one with neither is never checked at
	 * all (`$limit` no different from "no character_limit configured").
	 * Only a genuinely numeric value is ever checked (the same values
	 * `Number_Field_Type`/`Range_Field_Type::cast()` already produce) --
	 * a non-numeric value isn't this method's problem to catch.
	 *
	 * A field whose own Conditional Logic evaluates to "hidden" for this
	 * record is skipped entirely here too, the same as
	 * `validate_required_fields()`/`validate_character_limits()` -- see
	 * that first method's own docblock for what $effective_data is and
	 * why it can differ from $data.
	 *
	 * @param string     $class_name     Model class name.
	 * @param array      $data           sanitize_record_data()'s own output.
	 * @param array|null $effective_data See validate_required_fields()'s
	 *                                     own docblock.
	 * @return true|\WP_Error
	 */
	public static function validate_range_values( $class_name, array $data, $effective_data = null ) {
		$effective_data = is_array( $effective_data ) ? $effective_data : $data;
		$out_of_bounds  = array();

		foreach ( self::all( $class_name ) as $field ) {
			if ( ! self::is_field_visible_for_data( $field['conditional_logic'], $effective_data ) ) {
				continue;
			}

			if ( ! array_key_exists( $field['name'], $data ) ) {
				continue;
			}

			$value = $data[ $field['name'] ];

			if ( ! is_numeric( $value ) ) {
				continue;
			}

			$min = isset( $field['settings']['min_value'] ) && is_numeric( $field['settings']['min_value'] )
				? (float) $field['settings']['min_value']
				: null;
			$max = isset( $field['settings']['max_value'] ) && is_numeric( $field['settings']['max_value'] )
				? (float) $field['settings']['max_value']
				: null;

			if ( null === $min && null === $max ) {
				continue;
			}

			$value = (float) $value;

			if ( ( null !== $min && $value < $min ) || ( null !== $max && $value > $max ) ) {
				if ( null !== $min && null !== $max ) {
					/* translators: 1: field label, 2: minimum value, 3: maximum value */
					$out_of_bounds[] = sprintf( __( '%1$s (must be between %2$s and %3$s)', 'gateway' ), $field['label'], $min, $max );
				} elseif ( null !== $min ) {
					/* translators: 1: field label, 2: minimum value */
					$out_of_bounds[] = sprintf( __( '%1$s (must be at least %2$s)', 'gateway' ), $field['label'], $min );
				} else {
					/* translators: 1: field label, 2: maximum value */
					$out_of_bounds[] = sprintf( __( '%1$s (must be at most %2$s)', 'gateway' ), $field['label'], $max );
				}
			}
		}

		if ( empty( $out_of_bounds ) ) {
			return true;
		}

		return new \WP_Error(
			'gateway_record_value_out_of_range',
			sprintf(
				/* translators: %s: comma-separated list of "field label (must be ...)" */
				__( 'The following fields are outside their allowed range: %s.', 'gateway' ),
				implode( ', ', $out_of_bounds )
			),
			array( 'status' => 400 )
		);
	}

	/**
	 * Filters a raw, arbitrary-keyed array (e.g. straight off a REST
	 * request body) down to just this model's own known fields, casting
	 * each surviving value through its field type's own cast() -- used by
	 * Records_REST_Controller so a record create/update can never write
	 * to a column that isn't a real, currently-defined field, and so a
	 * "Number" field's value is actually stored as a number rather than
	 * whatever raw type the request body happened to send.
	 *
	 * @param string $class_name Model class name.
	 * @param array  $raw_data   Arbitrary-keyed input, e.g. $_POST-shaped.
	 * @return array Only the keys matching a real field, cast per type.
	 */
	public static function sanitize_record_data( $class_name, array $raw_data ) {
		$sanitized = array();

		foreach ( self::all( $class_name ) as $field ) {
			if ( ! array_key_exists( $field['name'], $raw_data ) ) {
				continue;
			}

			$type_class = Field_Type_Registry::get( $field['type'] );

			$sanitized[ $field['name'] ] = $type_class
				? $type_class::cast( $raw_data[ $field['name'] ] )
				: $raw_data[ $field['name'] ];
		}

		return $sanitized;
	}

	/**
	 * Filters+sanitizes a field's own raw "settings" -- its Presentation
	 * tab (`instructions`/`placeholder`/`step`/`prepend`/`append`, per
	 * `Field_Type::presentation_fields()` -- `instructions` alone is
	 * recognized by every type; the other four are per-type), its General
	 * tab's own `default` value (`Field_Type::supports_default_value()`),
	 * and its Validation tab's own `character_limit`/`min_value`+`max_value`
	 * (`Field_Type::supports_character_limit()`/`supports_range_limits()`)
	 * -- down to only the keys $type actually recognizes, each
	 * `sanitize_text_field()`'d and trimmed the same way a raw label
	 * already is (validate()'s own $label handling) -- an
	 * empty-after-trimming value is dropped entirely rather than stored
	 * as `''`, so a field with nothing actually filled in ends up with a
	 * genuinely empty `[]`, not a settings object full of blank strings.
	 * `character_limit` gets one further check on top: it's meaningless
	 * as an arbitrary string the way the others are, so anything left
	 * after trimming that isn't a positive whole number is dropped too,
	 * same as if it had been left blank ("Leave blank for no limit").
	 * `min_value`/`max_value` get a similar check, just looser: either
	 * must be genuinely numeric, but (unlike `character_limit`) a
	 * negative or fractional bound is entirely legitimate, so it's only
	 * non-numeric input that's dropped.
	 *
	 * All four live in the one `settings` column together (none of them
	 * are a different *shape* of data than a placeholder is, just a
	 * different tab, or -- `character_limit`/`min_value`/`max_value` -- an
	 * actual constraint instead of a display/default concern) --
	 * `presentation_fields()`/`supports_default_value()`/
	 * `supports_character_limit()`/`supports_range_limits()` stay four
	 * separate methods on `Field_Type` because they answer four different
	 * questions (which Presentation-tab inputs to show; whether a default
	 * makes sense for this type at all; whether a maximum length does;
	 * whether a numeric range does), merged back into one combined
	 * whitelist only here.
	 *
	 * This -- not a dedicated column per possible per-type setting, and
	 * not trusting whatever keys a request happens to send -- is what
	 * keeps `gateway_fields.settings` (one generic JSON column, arbitrary
	 * shape) from becoming a free-for-all: a type that recognizes nothing
	 * beyond the universal `instructions` (true for every built-in type
	 * except `Text_Field_Type`/`Number_Field_Type`/`Range_Field_Type`/
	 * `Text_Area_Field_Type` today) never ends up with anything else here
	 * regardless of what a request sends, the same "never trust the
	 * client, the type itself decides what's meaningful" reasoning
	 * `require_choices_for_field()` already applies to choices.
	 * `character_limit`/`min_value`/`max_value` are only ever *recorded*
	 * here -- actually enforcing them against real record data is
	 * `validate_character_limits()`/`validate_range_values()`'s own job,
	 * below.
	 *
	 * @param string $type         One of Field_Type_Registry::keys().
	 * @param mixed  $raw_settings Raw, arbitrary-keyed input, e.g. a REST
	 *                              request body's own `settings` object --
	 *                              tolerated as anything (a non-array
	 *                              value just yields `[]`, the same as an
	 *                              empty object would).
	 * @return array<string,string>
	 */
	public static function sanitize_settings( $type, $raw_settings ) {
		$type_class = Field_Type_Registry::get( $type );

		if ( ! $type_class || ! is_array( $raw_settings ) ) {
			return array();
		}

		$recognized_keys = $type_class::presentation_fields();

		if ( $type_class::supports_default_value() ) {
			$recognized_keys[] = 'default';
		}

		if ( $type_class::supports_character_limit() ) {
			$recognized_keys[] = 'character_limit';
		}

		if ( $type_class::supports_range_limits() ) {
			$recognized_keys[] = 'min_value';
			$recognized_keys[] = 'max_value';
		}

		$sanitized = array();

		foreach ( $recognized_keys as $key ) {
			if ( ! array_key_exists( $key, $raw_settings ) ) {
				continue;
			}

			$value = sanitize_text_field( trim( (string) $raw_settings[ $key ] ) );

			if ( '' === $value ) {
				continue;
			}

			// Unlike every other key here, 'character_limit' is meaningless
			// as an arbitrary string -- "Leave blank for no limit" is the
			// blank case (already handled above); anything present has to
			// actually be a positive whole number, or it's dropped the same
			// as a blank one, rather than stored as something
			// validate_character_limits() would otherwise have to guard
			// against separately.
			if ( 'character_limit' === $key && ( ! ctype_digit( $value ) || 0 === (int) $value ) ) {
				continue;
			}

			// 'min_value'/'max_value' are meaningless as arbitrary strings
			// too, but unlike 'character_limit' a negative or fractional
			// bound is entirely legitimate -- only genuinely non-numeric
			// input is dropped, the same as leaving it blank.
			if ( in_array( $key, array( 'min_value', 'max_value' ), true ) && ! is_numeric( $value ) ) {
				continue;
			}

			$sanitized[ $key ] = $value;
		}

		return $sanitized;
	}

	/**
	 * Filters+sanitizes a field's own raw "Conditional Logic" -- OR'd
	 * groups of AND'd rules, each `{field, operator, value}`, controlling
	 * whether this field appears at all in `RecordForm`'s own Add New/edit
	 * forms based on the *current* value of some other field on this same
	 * model. Applies uniformly regardless of $type, the same as `required`
	 * -- unlike `settings` (Presentation/Default Value/Character Limit),
	 * there's no `Field_Type` method gating which types get to have this
	 * at all. Its own column instead of one more `settings` key because
	 * it's a genuinely different *shape*: a nested tree of OR'd groups of
	 * AND'd rules, not a flat set of strings.
	 *
	 * `$exclude_field_name` is this field's own current name (the field
	 * the conditional logic being saved *belongs to*) -- a field can never
	 * meaningfully condition on its own value (by the time a rule could
	 * evaluate it, the field itself wouldn't even be rendered yet to have
	 * one), so it's excluded from the set of field names a rule's own
	 * `field` is allowed to reference. `''`/`null` for `add()` (a brand
	 * new field, not yet in `self::all()`'s own results regardless, so
	 * this has no practical effect there -- passed anyway for clarity at
	 * the call site).
	 *
	 * Each rule's `operator` must be one of the five this feature
	 * actually understands (`has_any_value`/`has_no_value`/`value_equals`/
	 * `value_not_equals`/`value_contains`) -- anything else, or a rule
	 * missing a `field`/referencing one that doesn't exist on this model
	 * (including this field's own name, or a name from some other
	 * model entirely), is dropped outright rather than stored. A `value`
	 * is sanitized the same way any other free-text setting already is,
	 * even for the two operators (`has_any_value`/`has_no_value`) that
	 * never actually read it -- harmless either way, and simpler than a
	 * conditional sanitize path per operator.
	 *
	 * A group with no surviving rules is dropped; if every group ends up
	 * dropped (including the common case of `enabled` itself being
	 * false, or `$raw` simply not being shaped like conditional logic at
	 * all), the result is `null` -- not `{enabled: false}` or `[]` -- so a
	 * field with nothing actually configured stores nothing, the same
	 * "empty means NULL, not an object full of blanks" convention
	 * `sanitize_settings()` already established. This does mean
	 * temporarily disabling the toggle and re-enabling it later starts
	 * from an empty rule builder again, not whatever was configured
	 * before -- the same accepted trade-off already made for a Choice
	 * field's own choices being forgotten the moment its type changes
	 * away from one that has any.
	 *
	 * A rule surviving here today can still go stale later: if the field
	 * it references is subsequently renamed or removed, this method isn't
	 * re-run against every OTHER field's already-stored conditional logic
	 * to fix it up (that would mean rewriting a potentially unrelated
	 * field's own row on every rename/removal). Instead, `all()`'s own
	 * `prune_conditional_logic_rules()` filters a stale reference back out
	 * every time conditional logic is actually read, so a dangling rule
	 * degrades to simply not being evaluated rather than ever pointing at
	 * the wrong field or erroring -- the on-disk JSON can lag slightly
	 * behind reality, but nothing reads it without this filter also
	 * running.
	 *
	 * @param string $class_name         Model class name.
	 * @param string $exclude_field_name This field's own current name --
	 *                                     never a valid `field` for one of
	 *                                     its own rules.
	 * @param mixed  $raw                Raw input, e.g. a REST request
	 *                                     body's own `conditional_logic`
	 *                                     object -- tolerated as anything.
	 * @return array{enabled:true,groups:array<int,array{rules:array<int,array{field:string,operator:string,value:string}>}>}|null
	 */
	public static function sanitize_conditional_logic( $class_name, $exclude_field_name, $raw ) {
		if ( ! is_array( $raw ) || empty( $raw['enabled'] ) ) {
			return null;
		}

		$valid_operators = array( 'has_any_value', 'has_no_value', 'value_equals', 'value_not_equals', 'value_contains' );

		$other_field_names = array();
		foreach ( self::all( $class_name ) as $field ) {
			if ( $field['name'] !== $exclude_field_name ) {
				$other_field_names[] = $field['name'];
			}
		}

		$groups = array();

		foreach ( (array) ( $raw['groups'] ?? array() ) as $raw_group ) {
			$rules = array();

			foreach ( (array) ( is_array( $raw_group ) ? ( $raw_group['rules'] ?? array() ) : array() ) as $raw_rule ) {
				if ( ! is_array( $raw_rule ) ) {
					continue;
				}

				$field    = sanitize_text_field( (string) ( $raw_rule['field'] ?? '' ) );
				$operator = sanitize_text_field( (string) ( $raw_rule['operator'] ?? '' ) );

				if ( '' === $field || ! in_array( $field, $other_field_names, true ) || ! in_array( $operator, $valid_operators, true ) ) {
					continue;
				}

				$rules[] = array(
					'field'    => $field,
					'operator' => $operator,
					'value'    => sanitize_text_field( trim( (string) ( $raw_rule['value'] ?? '' ) ) ),
				);
			}

			if ( ! empty( $rules ) ) {
				$groups[] = array( 'rules' => $rules );
			}
		}

		return empty( $groups ) ? null : array(
			'enabled' => true,
			'groups'  => $groups,
		);
	}

	/**
	 * Drops a rule from an already-`sanitize_conditional_logic()`'d
	 * structure the moment its own `field` no longer names one of this
	 * model's *current* fields -- see that method's own docblock for why
	 * this exists (a rename/removal elsewhere isn't proactively cascaded
	 * into every other field's own stored conditional logic; this is what
	 * catches a resulting stale reference instead, every time `all()`
	 * reads it back). A group left with no rules, or a $decoded that isn't
	 * shaped like conditional logic at all (including simply `null`), is
	 * dropped/returned as `null` the same way `sanitize_conditional_logic()`
	 * itself would.
	 *
	 * @param mixed    $decoded           json_decode()'d `conditional_logic`
	 *                                      column value, or `null`.
	 * @param string[] $valid_field_names This model's own current field
	 *                                      names (already excluding
	 *                                      whichever field $decoded itself
	 *                                      belongs to -- see all()'s own
	 *                                      call site).
	 * @return array{enabled:true,groups:array<int,array{rules:array<int,array{field:string,operator:string,value:string}>}>}|null
	 */
	private static function prune_conditional_logic_rules( $decoded, array $valid_field_names ) {
		if ( ! is_array( $decoded ) || empty( $decoded['enabled'] ) || ! is_array( $decoded['groups'] ?? null ) ) {
			return null;
		}

		$groups = array();

		foreach ( $decoded['groups'] as $group ) {
			$rules = array();

			foreach ( (array) ( is_array( $group ) ? ( $group['rules'] ?? array() ) : array() ) as $rule ) {
				if ( is_array( $rule ) && in_array( $rule['field'] ?? null, $valid_field_names, true ) ) {
					$rules[] = $rule;
				}
			}

			if ( ! empty( $rules ) ) {
				$groups[] = array( 'rules' => $rules );
			}
		}

		return empty( $groups ) ? null : array(
			'enabled' => true,
			'groups'  => $groups,
		);
	}

	/**
	 * Whether a field with this Conditional Logic should be considered to
	 * exist at all for this particular record -- OR across `$conditional_logic`'s
	 * own groups, AND within each group's own rules, evaluated against
	 * `$effective_data` (a plain `[field_name => value]` map -- see this
	 * method's own call sites, `validate_required_fields()`/
	 * `validate_character_limits()` below, for what that map actually
	 * contains on a create vs. an update). `true` (visible, evaluate this
	 * field normally) whenever `$conditional_logic` is `null`/disabled/has
	 * no groups at all -- the common case, every field with no Conditional
	 * Logic configured.
	 *
	 * A rule whose own `field` isn't a key in `$effective_data` at all is
	 * skipped -- neither satisfied nor failed -- rather than treated as
	 * "no value" (`has_no_value` would otherwise trivially match a rule
	 * this method genuinely has no data to evaluate, e.g. a Relate to Many
	 * field's own name on a partial update() that didn't touch it and has
	 * no real column for `$record->toArray()` to have surfaced it from
	 * either -- see `Records_REST_Controller::update_record()`'s own
	 * `$effective_data` construction). An empty group (already excluded by
	 * `sanitize_conditional_logic()`/`prune_conditional_logic_rules()` in
	 * practice, but tolerated here too) contributes nothing either way.
	 *
	 * @param array|null           $conditional_logic Already-decoded/pruned
	 *                                                   `{enabled, groups}`,
	 *                                                   or `null`.
	 * @param array<string,mixed>  $effective_data     `[field_name => value]`.
	 * @return bool
	 */
	private static function is_field_visible_for_data( $conditional_logic, array $effective_data ) {
		if ( ! is_array( $conditional_logic ) || empty( $conditional_logic['enabled'] ) || empty( $conditional_logic['groups'] ) ) {
			return true;
		}

		foreach ( $conditional_logic['groups'] as $group ) {
			$rules = is_array( $group ) ? ( $group['rules'] ?? array() ) : array();

			if ( empty( $rules ) ) {
				continue;
			}

			$group_matches = true;

			foreach ( $rules as $rule ) {
				if ( ! is_array( $rule ) || ! array_key_exists( 'field', $rule ) ) {
					continue;
				}

				if ( ! array_key_exists( $rule['field'], $effective_data ) ) {
					continue; // Can't evaluate -- doesn't count against this group.
				}

				if ( ! self::conditional_logic_rule_matches( $rule, $effective_data[ $rule['field'] ] ) ) {
					$group_matches = false;
					break;
				}
			}

			if ( $group_matches ) {
				return true; // OR across groups -- the first fully-matching one wins.
			}
		}

		return false;
	}

	/**
	 * @param array $rule  `{field, operator, value}` -- `field` itself
	 *                       isn't read here, only `operator`/`value`
	 *                       (the caller already resolved `field` to $value).
	 * @param mixed $value The referenced field's own current value.
	 * @return bool
	 */
	private static function conditional_logic_rule_matches( array $rule, $value ) {
		$operator   = $rule['operator'] ?? '';
		$rule_value = (string) ( $rule['value'] ?? '' );

		switch ( $operator ) {
			case 'has_any_value':
				return ! self::is_required_value_missing( $value );
			case 'has_no_value':
				return self::is_required_value_missing( $value );
			case 'value_equals':
				return self::conditional_logic_value_matches( $value, $rule_value, 'equals' );
			case 'value_not_equals':
				return ! self::conditional_logic_value_matches( $value, $rule_value, 'equals' );
			case 'value_contains':
				return self::conditional_logic_value_matches( $value, $rule_value, 'contains' );
			default:
				return true; // An operator that somehow isn't one of the five recognized ones never blocks a field from showing.
		}
	}

	/**
	 * `$value` an array (a Checkbox field's own selected choices, or a
	 * Relate to Many field's own ids, if still present in `$effective_data`
	 * at all) matches if ANY element does -- a single scalar is compared
	 * directly. `'equals'` is an exact, case-sensitive match; `'contains'`
	 * is a case-insensitive substring match (an empty `$rule_value` never
	 * "contains"-matches anything, rather than trivially matching every
	 * value the way an empty substring normally would).
	 *
	 * @param mixed  $value
	 * @param string $rule_value
	 * @param string $mode       'equals'|'contains'.
	 * @return bool
	 */
	private static function conditional_logic_value_matches( $value, $rule_value, $mode ) {
		foreach ( is_array( $value ) ? $value : array( $value ) as $candidate ) {
			$candidate_string = (string) $candidate;

			if ( 'equals' === $mode ) {
				if ( $candidate_string === $rule_value ) {
					return true;
				}
			} elseif ( '' !== $rule_value && false !== stripos( $candidate_string, $rule_value ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Add a new field: generates and runs an ADD COLUMN migration for it
	 * first, and only records the field's metadata once that has
	 * actually succeeded.
	 *
	 * For a Relationship_Field_Type ("Relate to One"/"Relate to Many"),
	 * $name is ignored entirely (there's nothing meaningful for a site
	 * owner to type -- see derive_relationship_field_name()) and
	 * $relationship_method is required instead: it must name one of this
	 * model's own already-configured relationships (Model_Relationships),
	 * of the exact type this field type binds to
	 * (Relationship_Field_Type::relationship_type()) -- "Relate to One"
	 * only offers `belongsTo` relationships, "Relate to Many" only
	 * `belongsToMany`, so a field can never end up pointing at, say, a
	 * `hasMany` relationship it can't actually represent.
	 *
	 * @param string      $class_name          Model class name.
	 * @param string      $name                Raw field name -- sanitized to a
	 *                                           lowercase snake_case machine name, which
	 *                                           becomes the real column name too. Ignored
	 *                                           for a Relationship_Field_Type -- see above.
	 * @param string      $type                One of Field_Type_Registry::keys().
	 * @param string      $label               Display label; blank defaults to a
	 *                                           title-cased version of the (sanitized)
	 *                                           name -- see this class's own docblock.
	 * @param string|null $relationship_method Required for a Relationship_Field_Type;
	 *                                           ignored otherwise.
	 * @param string[]|null $choices           Required (at least one
	 *                                           non-empty, unique value)
	 *                                           for a Choice_Field_Type
	 *                                           ("Buttons"/"Select"/
	 *                                           "Radio"/"Checkbox"); ignored
	 *                                           otherwise -- see
	 *                                           require_choices_for_field().
	 * @param bool          $required          Whether a record can be saved
	 *                                           with this field left empty --
	 *                                           see validate_required_fields().
	 * @param array         $settings          Raw "Presentation" settings --
	 *                                           filtered down to whatever
	 *                                           $type's own presentation_fields()
	 *                                           actually recognizes (`[]` for
	 *                                           every type that recognizes
	 *                                           none) -- see sanitize_settings().
	 * @param array         $conditional_logic Raw Conditional Logic --
	 *                                           filtered down to only rules
	 *                                           referencing one of this
	 *                                           model's OTHER real fields
	 *                                           with a recognized operator
	 *                                           -- see
	 *                                           sanitize_conditional_logic().
	 * @return array{id:int,name:string,label:string,type:string,position:int,relationship_method:?string,related_model:?string,choices:string[],required:bool,settings:array<string,string>,conditional_logic:?array}|\WP_Error
	 *              The added field (with its sanitized name) on success --
	 *              always appended after every existing field.
	 */
	public static function add( $class_name, $name, $type, $label = '', $relationship_method = null, $choices = null, $required = false, $settings = array(), $conditional_logic = array() ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$type_class = Field_Type_Registry::get( trim( (string) $type ) );
		$related_model = null;

		if ( $type_class && is_subclass_of( $type_class, Relationship_Field_Type::class ) ) {
			$relationship = self::require_relationship_for_field( $class_name, $relationship_method, $type_class );

			if ( is_wp_error( $relationship ) ) {
				return $relationship;
			}

			$name          = self::derive_relationship_field_name( $relationship, $type_class );
			$related_model = $relationship['related_model'];
		} else {
			$relationship_method = null;
		}

		$is_choice_type     = $type_class && is_subclass_of( $type_class, Choice_Field_Type::class );
		$validated_choices  = array();

		if ( $is_choice_type ) {
			$validated_choices = self::require_choices_for_field( $choices );

			if ( is_wp_error( $validated_choices ) ) {
				return $validated_choices;
			}
		}

		$field = self::validate( $class_name, $name, $type, null, $label );

		if ( is_wp_error( $field ) ) {
			return $field;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$table  = $model->getTable();
		$method = $type_class::blueprint_method();

		// '' means this field type has no real column at all (Relate to
		// Many -- its data lives in a pivot table Model_Relationships
		// already manages, not a column here) -- nothing to migrate,
		// straight to recording the metadata below. A Relate to One
		// field's own column is the other way a migration here can
		// already be unnecessary: Model_Relationships::add() now creates
		// a belongsTo's real FK column itself, the moment the
		// relationship is added (the exact same column name this
		// field's own derive_relationship_field_name() derives, by
		// construction) -- so by the time a Relate to One field gets
		// bound to it, the column usually already exists. Attempting to
		// ADD COLUMN a second time would fail outright, so this is
		// checked and skipped, not just left to error.
		if ( '' !== $method ) {
			$column_already_exists = is_subclass_of( $type_class, Relationship_Field_Type::class )
				&& \Illuminate\Database\Capsule\Manager::schema()->hasColumn( $table, $field['name'] );

			if ( ! $column_already_exists ) {
				$up_body   = self::column_statement( $table, "\$table->{$method}( '{$field['name']}' )->nullable();" );
				$down_body = self::column_statement( $table, "\$table->dropColumn( '{$field['name']}' );" );

				$migration_result = self::generate_and_run_migration( "Add{$field['name']}To{$table}Table", $up_body, $down_body );

				if ( is_wp_error( $migration_result ) ) {
					return $migration_result;
				}
			}
		}

		// Always appended after every existing field -- max() returns null
		// when this is the model's first field, which is exactly position
		// 0, not "null + 1".
		$max_position       = self::table()->where( 'model', $class_name )->max( 'position' );
		$field['position']  = null === $max_position ? 0 : ( (int) $max_position + 1 );

		$required            = (bool) $required;
		$sanitized_settings  = self::sanitize_settings( $field['type'], $settings );
		$sanitized_cl        = self::sanitize_conditional_logic( $class_name, $field['name'], $conditional_logic );

		$field_id = self::table()->insertGetId(
			array(
				'model'               => $class_name,
				'name'                => $field['name'],
				'label'               => $field['label'],
				'type'                => $field['type'],
				'position'            => $field['position'],
				'relationship_method' => $relationship_method,
				'required'            => $required,
				'settings'            => empty( $sanitized_settings ) ? null : wp_json_encode( $sanitized_settings ),
				'conditional_logic'   => null === $sanitized_cl ? null : wp_json_encode( $sanitized_cl ),
				'created_at'          => current_time( 'mysql' ),
				'updated_at'          => current_time( 'mysql' ),
			)
		);

		if ( $is_choice_type ) {
			Model_Field_Choices::set( $field_id, $validated_choices );
		}

		$field['id']                   = $field_id;
		$field['relationship_method']  = $relationship_method;
		$field['related_model']        = $related_model;
		$field['choices']              = $validated_choices;
		$field['required']             = $required;
		$field['settings']             = $sanitized_settings;
		$field['conditional_logic']    = $sanitized_cl;

		// The table row above is already the recorded field -- rewriting
		// the model file with the now-current, DB-sourced field list is a
		// materialized copy for Eloquent's own benefit, not the save
		// itself. A failure here is reported but non-fatal: the field is
		// safely recorded either way, and the next add()/update()/
		// remove() (or an explicit resync()) will rewrite the file again
		// with the complete, correct list.
		$rewrite_result = Model_Builder::rewrite_model_file( $class_name, $table, self::all( $class_name ), Model_Relationships::all( $class_name ) );

		if ( is_wp_error( $rewrite_result ) ) {
			$field['warnings'] = array( $rewrite_result->get_error_message() );
		}

		return $field;
	}

	/**
	 * Update an existing field, found by its current name (which may
	 * itself be changing) -- generates and runs whichever of a RENAME
	 * COLUMN / MODIFY COLUMN migration the change actually needs (both,
	 * one, or -- if neither the name nor the type actually changed --
	 * none at all) before recording the new metadata.
	 *
	 * @param string $class_name   Model class name.
	 * @param string $current_name The field's existing (sanitized) name.
	 * @param string $name         New raw name.
	 * @param string $type         New type.
	 * @param string $label        New display label; blank defaults to a
	 *                              title-cased version of the (sanitized)
	 *                              name -- see this class's own docblock.
	 * @param string[]|null $choices Required (see require_choices_for_field())
	 *                              whenever $type resolves to a Choice_Field_Type
	 *                              -- freely editable in place, unlike a
	 *                              relate field's relationship: replaces
	 *                              the field's entire choice list (content
	 *                              AND order), so this is also how a site
	 *                              owner reorders/adds/removes choices.
	 *                              Ignored (and any existing choices
	 *                              forgotten) whenever $type is not a
	 *                              Choice_Field_Type.
	 * @param bool          $required Whether a record can be saved with
	 *                              this field left empty -- see
	 *                              validate_required_fields(). Unlike
	 *                              choices, applies uniformly regardless
	 *                              of type -- always sent, never gated on
	 *                              what $type resolves to.
	 * @param array         $settings Raw "Presentation" settings, filtered
	 *                              down to whatever the (possibly new)
	 *                              $type's own presentation_fields()
	 *                              actually recognizes -- see
	 *                              sanitize_settings(). Freely editable in
	 *                              place, same as choices/required.
	 * @param array         $conditional_logic Raw Conditional Logic,
	 *                              filtered down to only rules referencing
	 *                              one of this model's OTHER real fields
	 *                              with a recognized operator -- see
	 *                              sanitize_conditional_logic(). Freely
	 *                              editable in place, same as
	 *                              choices/required/settings.
	 * @return array{id:int,name:string,label:string,type:string,position:int,choices:string[],required:bool,settings:array<string,string>,conditional_logic:?array}|\WP_Error
	 */
	public static function update( $class_name, $current_name, $name, $type, $label = '', $choices = null, $required = false, $settings = array(), $conditional_logic = array() ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$model_fields = self::all( $class_name );
		$index        = self::find_index( $model_fields, $current_name );

		if ( null === $index ) {
			return self::not_found_error();
		}

		$old_field = $model_fields[ $index ];
		$new_field = self::validate( $class_name, $name, $type, $current_name, $label );

		if ( is_wp_error( $new_field ) ) {
			return $new_field;
		}

		// update() never itself reorders a field -- see reorder() for
		// that -- so the position simply carries over unchanged.
		$new_field['position'] = $old_field['position'];

		$name_changed = $old_field['name'] !== $new_field['name'];
		$type_changed = $old_field['type'] !== $new_field['type'];

		// A Relate to One/Relate to Many field's name and type both follow
		// directly from its chosen relationship (see add()'s own
		// derive_relationship_field_name()) -- there's no "rename"/"retype"
		// concept for one that wouldn't just be a completely different
		// field, the same "no in-place edit, remove and re-add instead"
		// rule RelationshipEditor's own relationships already follow. Label
		// is still freely editable (that's true of every field type, and
		// touches no schema either way), so this only blocks the two
		// changes that would otherwise attempt an ADD-COLUMN-shaped
		// migration this field never had a real column for in the first
		// place (a Relate to Many's own blueprint_method() is '', which
		// would otherwise produce a malformed `$table->()->...` migration
		// statement). update() also has no `relationship_method` parameter
		// at all -- add() is the only path that can ever create one of
		// these -- so retyping *into* one here could never derive a valid
		// name for it regardless.
		$new_type_is_relationship = is_subclass_of( Field_Type_Registry::get( $new_field['type'] ), Relationship_Field_Type::class );
		$touches_relationship     = null !== $old_field['relationship_method'] || $new_type_is_relationship;

		if ( $touches_relationship && ( $name_changed || $type_changed ) ) {
			return new \WP_Error(
				'gateway_field_relationship_immutable',
				__( 'A Relate to One/Relate to Many field\'s relationship can\'t be changed -- remove it and add a new one instead.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		// Unlike a relate field's relationship, a Choice_Field_Type field's
		// own choices ARE freely editable in place -- there's no schema
		// reason not to (they're never part of the migration at all, just
		// rows in Model_Field_Choices), and reordering/adding/removing a
		// choice is exactly the kind of routine edit a site owner needs to
		// make without removing and re-adding the whole field. Required
		// whenever the (possibly new) type is a choice type, the same
		// "this type needs this extra thing" rule require_relationship_for_field()
		// already enforces for relationship types.
		$new_type_is_choice = is_subclass_of( Field_Type_Registry::get( $new_field['type'] ), Choice_Field_Type::class );
		$validated_choices  = array();

		if ( $new_type_is_choice ) {
			$validated_choices = self::require_choices_for_field( $choices );

			if ( is_wp_error( $validated_choices ) ) {
				return $validated_choices;
			}
		}

		// [] both when the old field was never a choice type at all, and
		// when it was one with nothing configured yet -- either way, an
		// empty array compares correctly against $validated_choices below.
		$choices_changed = $old_field['choices'] !== $validated_choices;

		// Compared against the *raw* stored label, not $old_field['label']
		// -- that came from all(), which already substitutes a computed
		// default for a NULL/blank one purely for display. Diffing
		// against that display value instead of what's actually in the
		// row was a real bug: resubmitting a field whose real label is
		// still NULL, with the same text the fallback already happened to
		// show, made this look like "nothing changed" and the row kept
		// its NULL forever -- only ever fixed by typing something the
		// fallback *wouldn't* have shown. A genuinely null/blank stored
		// value is always "changed" against any concrete label here.
		$stored_label  = self::table()
			->where( 'model', $class_name )
			->where( 'name', $old_field['name'] )
			->value( 'label' );
		$label_changed = (string) $stored_label !== $new_field['label'];

		$required         = (bool) $required;
		$required_changed = $old_field['required'] !== $required;

		$sanitized_settings = self::sanitize_settings( $new_field['type'], $settings );
		$settings_changed   = $old_field['settings'] !== $sanitized_settings;

		$sanitized_cl     = self::sanitize_conditional_logic( $class_name, $current_name, $conditional_logic );
		$cl_changed       = $old_field['conditional_logic'] !== $sanitized_cl;

		if ( ! $name_changed && ! $type_changed && ! $label_changed && ! $choices_changed && ! $required_changed && ! $settings_changed && ! $cl_changed ) {
			return $old_field;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$table = $model->getTable();

		// A label-only (or choices-only, required-only, or settings-only)
		// change never touches the schema -- there's no column to rename/
		// retype, nothing to migrate -- so it skips straight to recording
		// the new metadata below, the same way a truly no-op update
		// (caught above) skips it entirely.
		if ( ! $name_changed && ! $type_changed ) {
			return self::save_updated_field( $class_name, $table, $old_field['id'], $old_field['name'], $new_field, $new_type_is_choice, $validated_choices, $required, $sanitized_settings, $sanitized_cl );
		}

		$up   = array();
		$down = array();

		// Reversing a combined rename + type change means undoing the
		// *last* thing up() did first -- down() modifies the type while
		// the column still has its new name, then renames it back.
		if ( $name_changed ) {
			$up[] = self::column_statement( $table, "\$table->renameColumn( '{$old_field['name']}', '{$new_field['name']}' );" );
		}

		if ( $type_changed ) {
			$new_type_class = Field_Type_Registry::get( $new_field['type'] );
			$old_type_class = Field_Type_Registry::get( $old_field['type'] );
			$new_method     = $new_type_class::blueprint_method();
			$old_method     = $old_type_class::blueprint_method();

			$up[]   = self::column_statement( $table, "\$table->{$new_method}( '{$new_field['name']}' )->nullable()->change();" );
			$down[] = self::column_statement( $table, "\$table->{$old_method}( '{$new_field['name']}' )->nullable()->change();" );
		}

		if ( $name_changed ) {
			$down[] = self::column_statement( $table, "\$table->renameColumn( '{$new_field['name']}', '{$old_field['name']}' );" );
		}

		$migration_result = self::generate_and_run_migration(
			"Update{$old_field['name']}In{$table}Table",
			implode( "\n", $up ),
			implode( "\n", $down )
		);

		if ( is_wp_error( $migration_result ) ) {
			return $migration_result;
		}

		return self::save_updated_field( $class_name, $table, $old_field['id'], $old_field['name'], $new_field, $new_type_is_choice, $validated_choices, $required, $sanitized_settings );
	}

	/**
	 * Shared tail end of update(): records the new name/label/type against
	 * the field's existing row (found by its *current* name, which may
	 * itself be one of the values changing), keeps its choice list
	 * (Model_Field_Choices) in lock-step, and rewrites the model file --
	 * used both after a schema-changing update (name and/or type changed,
	 * migration already run) and for a label-/choices-only one (nothing to
	 * migrate at all, see update()'s own early return for that case).
	 *
	 * @param string   $class_name    Model class name.
	 * @param string   $table         Table name.
	 * @param int      $field_id      The field's own gateway_fields.id.
	 * @param string   $current_name  The field's existing row, found by name.
	 * @param array    $new_field     {name, label, type} to save.
	 * @param bool     $is_choice_type Whether $new_field['type'] is a Choice_Field_Type.
	 * @param string[] $choices       Already-validated choices -- only used/saved when $is_choice_type.
	 * @param bool     $required      Whether this field is required -- applies unconditionally, unlike $choices.
	 * @param array    $settings      Already-sanitize_settings()'d Presentation settings -- applies unconditionally, same as $required.
	 * @param array|null $conditional_logic Already-sanitize_conditional_logic()'d Conditional Logic -- applies unconditionally, same as $required.
	 * @return array{id:int,name:string,label:string,type:string,choices:string[],required:bool,settings:array<string,string>,conditional_logic:?array}|\WP_Error
	 */
	private static function save_updated_field( $class_name, $table, $field_id, $current_name, array $new_field, $is_choice_type, array $choices, $required, array $settings = array(), $conditional_logic = null ) {
		self::table()
			->where( 'model', $class_name )
			->where( 'name', $current_name )
			->update(
				array(
					'name'              => $new_field['name'],
					'label'             => $new_field['label'],
					'type'              => $new_field['type'],
					'required'          => (bool) $required,
					'settings'          => empty( $settings ) ? null : wp_json_encode( $settings ),
					'conditional_logic' => null === $conditional_logic ? null : wp_json_encode( $conditional_logic ),
					'updated_at'        => current_time( 'mysql' ),
				)
			);

		if ( $is_choice_type ) {
			Model_Field_Choices::set( $field_id, $choices );
		} else {
			// Cheap no-op when the field was never a choice type -- but
			// necessary cleanup when it just stopped being one (a real
			// type change, e.g. Select -> Text): this same row id would
			// otherwise silently resurrect its old, no-longer-relevant
			// choices if the field were ever changed back to a choice
			// type later.
			Model_Field_Choices::forget( $field_id );
		}

		$new_field['id']                = $field_id;
		$new_field['choices']           = $is_choice_type ? $choices : array();
		$new_field['required']          = (bool) $required;
		$new_field['settings']          = $settings;
		$new_field['conditional_logic'] = $conditional_logic;

		$rewrite_result = Model_Builder::rewrite_model_file( $class_name, $table, self::all( $class_name ), Model_Relationships::all( $class_name ) );

		if ( is_wp_error( $rewrite_result ) ) {
			$new_field['warnings'] = array( $rewrite_result->get_error_message() );
		}

		return $new_field;
	}

	/**
	 * Remove a field: generates and runs a DROP COLUMN migration first,
	 * and only forgets the field's metadata once that has actually
	 * succeeded.
	 *
	 * @param string $class_name Model class name.
	 * @param string $name       Field's (sanitized) name.
	 * @return true|\WP_Error
	 */
	public static function remove( $class_name, $name ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$model_fields = self::all( $class_name );
		$index        = self::find_index( $model_fields, $name );

		if ( null === $index ) {
			return self::not_found_error();
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$field      = $model_fields[ $index ];
		$table      = $model->getTable();
		$type_class = Field_Type_Registry::get( $field['type'] );
		$method     = $type_class::blueprint_method();

		// '' means this field never had a real column at all (Relate to
		// Many) -- nothing to drop, straight to forgetting the metadata
		// below. A Relate to One field's own column is never dropped
		// here either, even though it does have one: that column is
		// really owned by the relationship it's bound to, not the field
		// -- Model_Relationships::add() creates it independently of
		// whether a Relate to One field ever gets bound to it at all, and
		// the relationship's own generated belongsTo() method keeps
		// needing it to actually function regardless of this field's own
		// fate. Dropping it here would silently break a still-live
		// relationship the moment its Relate to One field was removed --
		// exactly the "leaves it usable but pointing at schema that's
		// gone" bug this whole ownership model was introduced to stop
		// happening, just from the opposite direction. Model_Relationships
		// itself is the only thing that could ever safely drop it -- and,
		// like its own pivot table, it deliberately doesn't (see that
		// class's own remove()).
		if ( '' !== $method && ! is_subclass_of( $type_class, Relationship_Field_Type::class ) ) {
			$up_body   = self::column_statement( $table, "\$table->dropColumn( '{$field['name']}' );" );
			$down_body = self::column_statement( $table, "\$table->{$method}( '{$field['name']}' )->nullable();" );

			$migration_result = self::generate_and_run_migration( "Remove{$field['name']}From{$table}Table", $up_body, $down_body );

			if ( is_wp_error( $migration_result ) ) {
				return $migration_result;
			}
		}

		self::table()
			->where( 'model', $class_name )
			->where( 'name', $field['name'] )
			->delete();

		// A removed field's own choices (if it had any) are meaningless
		// orphans otherwise -- harmless no-op for every other field type.
		Model_Field_Choices::forget( $field['id'] );

		// Not surfaced as a warning here (unlike add()/update()) -- removing
		// a field succeeded regardless, and there's no freshly-added field
		// whose immediate usability depends on this the way there is there.
		Model_Builder::rewrite_model_file( $class_name, $table, self::all( $class_name ), Model_Relationships::all( $class_name ) );

		return true;
	}

	/**
	 * Deletes every field row recorded for a model -- called by
	 * Model_Builder::rename() when retiring the old class, since a
	 * renamed model starts fresh on fields (see that method's own
	 * docblock for why field definitions aren't carried over). Without
	 * this, a class name freed up by a rename (or reused by a later,
	 * unrelated model created with the same title) would inherit
	 * whatever field rows the old model happened to leave behind.
	 *
	 * @param string $class_name Model class name.
	 */
	public static function forget( $class_name ) {
		$field_ids = self::table()->where( 'model', $class_name )->pluck( 'id' )->all();

		self::table()->where( 'model', $class_name )->delete();

		// Same "would otherwise inherit forgotten leftovers" reasoning as
		// this method's own docblock, one level down: a field's own
		// choices, not just the field row itself.
		Model_Field_Choices::forget_for_fields( $field_ids );
	}

	/**
	 * Rewrites a model's own .php file from its current, DB-sourced field
	 * list -- the explicit form of the same repair add()/update()/
	 * remove() already perform as a side effect of themselves. Useful on
	 * its own when the table and file are suspected to have drifted (e.g.
	 * after a rewrite_model_file() failure was reported as a warning) but
	 * nothing about the model's fields is otherwise changing.
	 *
	 * @param string $class_name Model class name.
	 * @return true|\WP_Error
	 */
	public static function resync( $class_name ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		return Model_Builder::rewrite_model_file( $class_name, $model->getTable(), self::all( $class_name ), Model_Relationships::all( $class_name ) );
	}

	/**
	 * Reorders every one of a model's fields at once, driven by the Field
	 * Editor's own sortable list -- a pure metadata write (there's no
	 * column to move, nothing to migrate), the same "no schema
	 * consequence" territory a label-only update() already occupies.
	 *
	 * @param string   $class_name Model class name.
	 * @param string[] $names      Every one of the model's field names, in
	 *                              the desired new order -- must be an
	 *                              exact permutation of its current
	 *                              fields, no more and no fewer.
	 * @return array<int,array{name:string,label:string,type:string,position:int}>|\WP_Error
	 *              The fields in their new order.
	 */
	public static function reorder( $class_name, array $names ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$existing = array_column( self::all( $class_name ), 'name' );

		$sorted_existing = $existing;
		$sorted_new      = array_values( $names );
		sort( $sorted_existing );
		sort( $sorted_new );

		if ( $sorted_existing !== $sorted_new ) {
			return new \WP_Error(
				'gateway_field_order_mismatch',
				__( 'The new order must include exactly this model\'s existing fields, no more and no fewer.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		foreach ( array_values( $names ) as $position => $name ) {
			self::table()
				->where( 'model', $class_name )
				->where( 'name', $name )
				->update(
					array(
						'position'   => $position,
						'updated_at' => current_time( 'mysql' ),
					)
				);
		}

		$reordered = self::all( $class_name );

		// Not surfaced as a warning here (same reasoning as remove()) --
		// the reorder itself already succeeded regardless, and a stale
		// file here is purely cosmetic (getFields()'s *order*, not its
		// contents) until the next field change or an explicit resync()
		// heals it.
		Model_Builder::rewrite_model_file( $class_name, $model->getTable(), $reordered, Model_Relationships::all( $class_name ) );

		return $reordered;
	}

	/**
	 * Generates one migration file (a unique, version-suffixed class name
	 * -- add/update/remove can each happen more than once for the same
	 * field over a model's life, unlike the one-time "create table"
	 * migration, so the class name alone can't be assumed unique the way
	 * Model_Builder::migration_class_for_table() is), runs it, and cleans
	 * up (file + registration) if that run fails.
	 *
	 * @param string $class_name_prefix Base for the migration class name,
	 *                                   e.g. "AddFirstNameToTicketsTable"
	 *                                   -- the version number is appended
	 *                                   to guarantee uniqueness.
	 * @param string $up_body           up() method body (PHP statements).
	 * @param string $down_body         down() method body.
	 * @return int|\WP_Error The migration version on success.
	 */
	private static function generate_and_run_migration( $class_name_prefix, $up_body, $down_body ) {
		Model_Builder::ensure_directories();

		$version         = Model_Builder::next_migration_version();
		$migration_class = \Illuminate\Support\Str::studly( $class_name_prefix ) . 'V' . $version;
		$migration_path  = trailingslashit( GATEWAY_MIGRATIONS_DIR ) . Model_Builder::migration_filename_for_class( $version, $migration_class );

		if ( file_exists( $migration_path ) || class_exists( $migration_class, false ) ) {
			return new \WP_Error(
				'gateway_field_migration_exists',
				__( 'Could not generate a unique migration for this change -- please try again.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		if ( false === file_put_contents( $migration_path, self::migration_template( $migration_class, $version, $up_body, $down_body ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error(
				'gateway_field_write_failed',
				__( 'Could not write the migration file -- check that wp-content/gateway is writable.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		require_once $migration_path;
		Migration_Registry::register( $migration_class );

		$run_result = Migration_Runner::run( $migration_class );

		if ( is_wp_error( $run_result ) ) {
			Migration_Registry::unregister( $migration_class );

			if ( file_exists( $migration_path ) ) {
				wp_delete_file( $migration_path );
			}

			return $run_result;
		}

		return $version;
	}

	/**
	 * Wraps one Blueprint statement in its own Schema::table() call --
	 * every generated up()/down() body here is one or more of these,
	 * concatenated.
	 *
	 * @param string $table     Table name.
	 * @param string $statement A single `$table->...;` Blueprint call.
	 * @return string Indented PHP source for one full statement.
	 */
	private static function column_statement( $table, $statement ) {
		return "\t\tSchema::table( '{$table}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {\n\t\t\t{$statement}\n\t\t} );";
	}

	/**
	 * @param string $migration_class Migration class name.
	 * @param int    $version         Migration version number.
	 * @param string $up_body         up() method body.
	 * @param string $down_body       down() method body.
	 * @return string PHP source for the migration file.
	 */
	private static function migration_template( $migration_class, $version, $up_body, $down_body ) {
		return <<<PHP
<?php
/**
 * Gateway-generated migration -- created by the Field Editor. Run
 * automatically once, immediately after being generated.
 */

class {$migration_class} extends \\Illuminate\\Database\\Migrations\\Migration {

	/**
	 * @var int
	 */
	public \$version = {$version};

	/**
	 * @return void
	 */
	public function up() {
{$up_body}
	}

	/**
	 * @return void
	 */
	public function down() {
{$down_body}
	}
}

PHP;
	}

	/**
	 * @param array  $model_fields One model's flat field array.
	 * @param string $name         Field name to find.
	 * @return int|null
	 */
	private static function find_index( array $model_fields, $name ) {
		foreach ( $model_fields as $index => $field ) {
			if ( isset( $field['name'] ) && $field['name'] === $name ) {
				return $index;
			}
		}

		return null;
	}

	/**
	 * Validate + sanitize a field's name/type, checking name uniqueness
	 * (and that it isn't one of RESERVED_NAMES) against the model's other
	 * fields -- excluding $ignore_name, the field's own current name,
	 * when updating it in place.
	 *
	 * @param string      $class_name  Model class name.
	 * @param string      $name        Raw field name.
	 * @param string      $type        Field type.
	 * @param string|null $ignore_name Exclude this existing name from the
	 *                                  uniqueness check.
	 * @param string      $label       Raw display label; blank defaults
	 *                                  to a title-cased version of the
	 *                                  (sanitized) name.
	 * @return array{name:string,label:string,type:string}|\WP_Error
	 */
	private static function validate( $class_name, $name, $type, $ignore_name, $label = '' ) {
		$sanitized_name = self::sanitize_name( $name );

		if ( '' === $sanitized_name ) {
			return new \WP_Error(
				'gateway_field_name_required',
				__( 'Field name must contain at least one letter or number.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		if ( in_array( $sanitized_name, self::RESERVED_NAMES, true ) ) {
			return new \WP_Error(
				'gateway_field_name_reserved',
				sprintf(
					/* translators: %s: field name */
					__( '"%s" is a reserved column name and can\'t be used as a field name.', 'gateway' ),
					$sanitized_name
				),
				array( 'status' => 400 )
			);
		}

		$type = trim( (string) $type );

		if ( null === Field_Type_Registry::get( $type ) ) {
			return new \WP_Error(
				'gateway_field_invalid_type',
				sprintf(
					/* translators: %s: comma-separated list of valid types */
					__( 'Field type must be one of: %s.', 'gateway' ),
					implode( ', ', Field_Type_Registry::keys() )
				),
				array( 'status' => 400 )
			);
		}

		foreach ( self::all( $class_name ) as $existing ) {
			if ( isset( $existing['name'] ) && $existing['name'] === $sanitized_name && $sanitized_name !== $ignore_name ) {
				return new \WP_Error(
					'gateway_field_name_exists',
					sprintf(
						/* translators: %s: field name */
						__( 'A field named "%s" already exists on this model.', 'gateway' ),
						$sanitized_name
					),
					array( 'status' => 409 )
				);
			}
		}

		$label = sanitize_text_field( trim( (string) $label ) );

		if ( '' === $label ) {
			$label = self::default_label( $sanitized_name );
		}

		return array(
			'name'  => $sanitized_name,
			'label' => $label,
			'type'  => $type,
		);
	}

	/**
	 * Validates a Relationship_Field_Type field's chosen relationship: it
	 * must name one of $class_name's own already-configured relationships
	 * (Model_Relationships), and that relationship's own type must match
	 * exactly what $type_class binds to (Relate to One only ever offers
	 * `belongsTo`, Relate to Many only `belongsToMany`) -- never trusted
	 * from the request, since nothing about the type dropdown or a
	 * relationship picker actually enforces that pairing client-side.
	 *
	 * @param string $class_name          Model class name.
	 * @param mixed  $relationship_method Raw relationship_method from the request.
	 * @param string $type_class          The Relationship_Field_Type class being added.
	 * @return array{related_model:string,type:string,method_name:string}|\WP_Error
	 */
	private static function require_relationship_for_field( $class_name, $relationship_method, $type_class ) {
		$relationship_method = trim( (string) $relationship_method );

		if ( '' === $relationship_method ) {
			return new \WP_Error(
				'gateway_field_relationship_required',
				__( 'Choose a relationship for this field.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		$relationship = Model_Relationships::find( $class_name, $relationship_method );

		if ( ! $relationship ) {
			return new \WP_Error(
				'gateway_relationship_not_found',
				__( 'Relationship not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$expected_type = $type_class::relationship_type();

		if ( $relationship['type'] !== $expected_type ) {
			return new \WP_Error(
				'gateway_field_relationship_type_mismatch',
				sprintf(
					/* translators: 1: field type label, 2: expected relationship type key */
					__( 'A "%1$s" field can only be bound to a "%2$s" relationship.', 'gateway' ),
					$type_class::label(),
					$expected_type
				),
				array( 'status' => 400 )
			);
		}

		return $relationship;
	}

	/**
	 * Validates + sanitizes a Choice_Field_Type field's own choice list --
	 * required for one of these (`add()`'s own $choices, or `update()`'s
	 * whenever the resulting type is a choice type), the same "this type
	 * needs this extra thing" role require_relationship_for_field() plays
	 * for a relationship type.
	 *
	 * Each raw choice is `sanitize_text_field()`'d and trimmed the same
	 * way a raw label already is (validate()'s own $label handling);
	 * empty ones are silently dropped (a blank row in the admin app's own
	 * orderable list editor, e.g. one added and left untyped, shouldn't
	 * itself be an error) -- but the list as a whole must end up with at
	 * least one real choice, and every one of them must be distinct
	 * (case-sensitive, matching gateway_field_choices' own unique(field_id,
	 * value) constraint), both surfaced as a clear error rather than
	 * silently coerced (deduplicating instead, for instance, would make a
	 * mistyped near-duplicate simply vanish with no feedback at all).
	 *
	 * @param mixed $raw_choices Raw choices from the request -- expected
	 *                            to be an array of strings, but tolerated
	 *                            as anything (a missing/non-array value
	 *                            just yields the "add at least one choice"
	 *                            error below, same as an empty array would).
	 * @return string[]|\WP_Error Ordered, sanitized, de-duplicated-checked
	 *                              choice values.
	 */
	private static function require_choices_for_field( $raw_choices ) {
		$raw_choices = is_array( $raw_choices ) ? $raw_choices : array();

		$sanitized = array();

		foreach ( $raw_choices as $raw_choice ) {
			$value = sanitize_text_field( trim( (string) $raw_choice ) );

			if ( '' !== $value ) {
				$sanitized[] = $value;
			}
		}

		if ( empty( $sanitized ) ) {
			return new \WP_Error(
				'gateway_field_choices_required',
				__( 'Add at least one choice for this field.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		if ( count( array_unique( $sanitized ) ) !== count( $sanitized ) ) {
			return new \WP_Error(
				'gateway_field_choices_duplicate',
				__( 'Choices must be unique -- remove the duplicate and try again.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		return array_values( $sanitized );
	}

	/**
	 * The real field name a Relationship_Field_Type field always gets --
	 * never typed in, always derived from the chosen relationship itself,
	 * so it's guaranteed to be exactly what Eloquent's own relationship
	 * conventions expect:
	 *
	 * - `belongsTo` ("Relate to One"): `Model_Relationships::
	 *   belongs_to_foreign_key( $method_name )` -- the real FK column
	 *   Eloquent's own `belongsTo()` default convention looks for
	 *   (confirmed against `Illuminate\Database\Eloquent\Concerns\
	 *   HasRelationships::belongsTo()`: the foreign key defaults to the
	 *   calling method's own name, snake-cased, plus "_id"). The one
	 *   single place this is derived, shared with `Model_Relationships::
	 *   add()`'s own eager FK-column creation for a `belongsTo` -- so a
	 *   Relate to One field bound to a relationship always names itself
	 *   after the exact column that relationship's own generated
	 *   `belongsTo()` method already needs to function, by construction,
	 *   never by two independent derivations happening to agree.
	 * - `belongsToMany` ("Relate to Many"): the method_name itself, used
	 *   only as this field's own metadata identity (gateway_fields'
	 *   `name` column) -- there's no real column to name at all (see
	 *   blueprint_method()'s own docblock), so nothing about Eloquent's
	 *   own conventions constrains this one; it just needs to be a valid,
	 *   unique field name, and a relationship's own method_name already is.
	 *
	 * @param array  $relationship {related_model, type, method_name}.
	 * @param string $type_class   The Relationship_Field_Type class being added.
	 * @return string
	 */
	private static function derive_relationship_field_name( array $relationship, $type_class ) {
		if ( 'belongsTo' === $relationship['type'] ) {
			return Model_Relationships::belongs_to_foreign_key( $relationship['method_name'] );
		}

		return $relationship['method_name'];
	}

	/**
	 * Pulls every Relate to Many field's own value out of $data (by
	 * reference) -- there's no column for Records_REST_Controller to
	 * write it to via a plain create()/update() call the way every other
	 * field's value gets written; the caller uses the returned map to
	 * call each one's own relationship method's `sync()` instead, after
	 * the record itself is saved.
	 *
	 * @param string $class_name Model class name.
	 * @param array  $data       Sanitized record data (Model_Fields::sanitize_record_data()'s
	 *                            own output) -- modified in place, with
	 *                            every Relate to Many key removed.
	 * @return array<string,int[]> Map of relationship method_name => ids
	 *                               to sync, for whichever Relate to Many
	 *                               fields were actually present in $data.
	 */
	public static function extract_relate_many_data( $class_name, array &$data ) {
		$extracted = array();

		foreach ( self::all( $class_name ) as $field ) {
			if ( null === $field['relationship_method'] ) {
				continue;
			}

			$type_class = Field_Type_Registry::get( $field['type'] );

			if ( ! $type_class || ! is_subclass_of( $type_class, Relationship_Field_Type::class ) || 'belongsToMany' !== $type_class::relationship_type() ) {
				continue;
			}

			if ( array_key_exists( $field['name'], $data ) ) {
				$extracted[ $field['relationship_method'] ] = (array) $data[ $field['name'] ];
				unset( $data[ $field['name'] ] );
			}
		}

		return $extracted;
	}

	/**
	 * @param string $name Sanitized field name, e.g. "first_name".
	 * @return string Title-cased default label, e.g. "First Name".
	 */
	private static function default_label( $name ) {
		return \Illuminate\Support\Str::headline( $name );
	}

	/**
	 * @param string $raw Free-text field name, e.g. "First Name".
	 * @return string Lowercase snake_case machine name, e.g. "first_name"
	 *                -- this becomes the real column name too, so it's
	 *                held to the same safe-identifier shape a table/class
	 *                name is.
	 */
	private static function sanitize_name( $raw ) {
		$name = strtolower( trim( (string) $raw ) );
		$name = preg_replace( '/[^a-z0-9]+/', '_', $name );

		return trim( $name, '_' );
	}

	/**
	 * @param string $class_name Model class name.
	 * @return \Illuminate\Database\Eloquent\Model|\WP_Error
	 */
	private static function require_model( $class_name ) {
		if ( ! Model_Registry::has( $class_name ) || ! class_exists( $class_name ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return new $class_name();
	}

	/**
	 * @return \WP_Error
	 */
	private static function not_found_error() {
		return new \WP_Error(
			'gateway_field_not_found',
			__( 'Field not found.', 'gateway' ),
			array( 'status' => 404 )
		);
	}

	/**
	 * @return \WP_Error
	 */
	private static function unavailable_error() {
		return new \WP_Error(
			'gateway_database_unavailable',
			__( 'The database connection isn\'t currently working -- check the Database Connection screen before editing fields.', 'gateway' ),
			array( 'status' => 503 )
		);
	}
}
