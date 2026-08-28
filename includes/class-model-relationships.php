<?php
/**
 * Relationship definitions for generated models -- what the admin app's
 * Relationship Editor (on a model's detail screen, right below its Field
 * Editor) manages. Structurally this is Model_Fields' own design, applied
 * to a different kind of thing: the `gateway_relationships` table (model,
 * related_model, type, method_name -- see ensure_table()) is the one
 * source of truth, written to first; a model's own generated relationship
 * methods are a *materialized copy* of that same data, printed directly
 * into the model's .php file (see Model_Builder::model_template()/
 * relationships_literal()) every time add()/remove() changes something.
 *
 * Unlike a field, a relationship's own *metadata* (this table's row, the
 * generated relationship method) never depends on anything else -- but
 * every one of Eloquent's four relationship types genuinely cannot
 * function without some real piece of schema existing first: a column
 * somewhere, or (for `belongsToMany`) a whole third table. add() creates
 * exactly that, automatically, the moment the relationship itself is
 * added, for every type -- Gateway-managed infrastructure the same way
 * `gateway_fields`/`gateway_relationships` themselves are, not something
 * a site owner configures or a separate step they need to remember:
 *
 * - `belongsTo`: a real FK column (`belongs_to_foreign_key( $method_name )`,
 *   `unsignedBigInteger`, nullable) on `model`'s own table.
 * - `hasOne`/`hasMany`: the same kind of column, but on `related_model`'s
 *   own table instead (`Str::snake( $model ) . '_id'`) -- Eloquent's own
 *   default puts the FK on the "many"/"has" side's *target*, not the
 *   owning side, for these two.
 * - `belongsToMany`: a whole pivot table, since Eloquent genuinely cannot
 *   function without a THIRD table for this one -- never a column on
 *   either side's own table (see `ensure_pivot_table()`).
 *
 * Every one of these is idempotent (see `ensure_foreign_key_column()`/
 * `ensure_pivot_table()`'s own docblocks). remove() cleans up in the
 * other direction, but only where it's actually safe to: a `belongsTo`/
 * `hasOne`/`hasMany`'s own FK column is dropped too (`drop_foreign_key_
 * column_if_unused()`) -- *unless* a real field is still named exactly
 * that, or some *other* still-recorded relationship (anywhere -- e.g.
 * `Event hasMany Ticket` and `Ticket belongsTo Event` share the exact
 * same physical `tickets.event_id` column by Eloquent's own convention;
 * removing one must never drop a column the other still needs) would
 * independently derive the identical (table, column) pair. `belongsToMany`'s
 * pivot table is the one exception left deliberately alone: a whole
 * shared table, not a single column another exact relationship could
 * also derive, so there's even less signal here to tell whether
 * dropping it is actually safe -- another `belongsToMany` (from the
 * opposite direction, or a future one) could still be relying on the
 * exact same table, and Eloquent's own naming convention doesn't
 * distinguish direction.
 *
 * A real bug this fixes: an earlier version of this class treated
 * `belongsTo`/`hasOne`/`hasMany` as pure metadata with no schema
 * consequence at all -- the ONLY way to get a `belongsTo`'s own real FK
 * column into existence was a site owner separately remembering to add a
 * matching "Relate to One" field afterward (Model_Fields' own
 * `Relationship_Field_Type` handling), and `hasOne`/`hasMany` had no
 * mechanism to get their own FK column at all. Using the relationship
 * for anything (eager-loading it -- e.g. this feature's own "Related
 * Fields," `Column_Registry::get_related_columns_for_collection()` --
 * or simply calling the generated method) before that manual step
 * happened failed with a live `Unknown column` SQL error, not a caught,
 * friendly one. Every relationship type is now immediately, fully
 * functional the moment it's added, with no separate step required --
 * "Relate to One"/"Relate to Many" are purely an optional admin-UI
 * layer on top (autocomplete search-and-select for a relationship that
 * already works without them), not required infrastructure.
 *
 * Method names are never typed in -- they're derived automatically from
 * the related model's own class name and the relationship's plurality
 * (see derive_method_name()), the same way Model_Fields derives a
 * default label from a field's name: "Make" relating to "Model" via
 * belongsTo gets the method `model()`; via hasMany, `models()`. This is
 * deliberate simplification, not an oversight -- see this feature's own
 * request ("choose the names ... automatically to simplify the
 * selection").
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Relationships {

	/**
	 * Table name (unprefixed -- Capsule's own connection config already
	 * applies $wpdb->prefix, same as gateway_fields).
	 */
	const TABLE = 'gateway_relationships';

	/**
	 * Every relationship type the Relationship Editor can offer. Each
	 * key is both this feature's own 'type' value *and* the literal
	 * Eloquent method name called in the generated relationship method
	 * (`$this->hasMany(...)`, etc.) -- no separate mapping needed.
	 * 'plural' decides whether derive_method_name() pluralizes the
	 * related model's name for the method name -- "many" relationships
	 * (hasMany, belongsToMany) get one, "one" relationships (hasOne,
	 * belongsTo) don't.
	 */
	const TYPES = array(
		'hasOne'        => array(
			'label'  => 'Has One',
			'plural' => false,
		),
		'hasMany'       => array(
			'label'  => 'Has Many',
			'plural' => true,
		),
		'belongsTo'     => array(
			'label'  => 'Belongs To',
			'plural' => false,
		),
		'belongsToMany' => array(
			'label'  => 'Belongs To Many',
			'plural' => true,
		),
	);

	/**
	 * Creates the gateway_relationships table if it doesn't already
	 * exist -- normally done once by gateway_activate() on plugin
	 * activation (see gateway.php), but also called defensively here
	 * before every read/write in this class, the same "also do it
	 * lazily" trade-off Model_Fields::ensure_table() already accepts.
	 */
	public static function ensure_table() {
		$schema = \Illuminate\Database\Capsule\Manager::schema();

		if ( $schema->hasTable( self::TABLE ) ) {
			return;
		}

		$schema->create(
			self::TABLE,
			function ( \Illuminate\Database\Schema\Blueprint $table ) {
				$table->id();
				$table->string( 'model' );         // Owning model class, e.g. "Make".
				$table->string( 'related_model' ); // Related model class, e.g. "Model".
				$table->string( 'type' );           // One of self::TYPES' own keys.
				$table->string( 'method_name' );    // Auto-derived -- see derive_method_name().
				$table->timestamps();

				// Belt-and-suspenders alongside add()'s own uniqueness
				// check below -- a method can't be declared twice in the
				// same generated class, so two relationships that would
				// print the identical method name can never both land
				// here, even if two requests somehow raced past that
				// check at the same time.
				$table->unique( array( 'model', 'method_name' ) );
			}
		);
	}

	/**
	 * @return \Illuminate\Database\Query\Builder Query builder for the
	 *              gateway_relationships table.
	 */
	private static function table() {
		self::ensure_table();

		return \Illuminate\Database\Capsule\Manager::table( self::TABLE );
	}

	/**
	 * Reads a model's relationships straight from the gateway_relationships
	 * table -- the one source of truth (see this class's own docblock).
	 * Ordered by id (insertion order).
	 *
	 * @param string $class_name Model class name.
	 * @return array<int,array{related_model:string,type:string,method_name:string}>
	 */
	public static function all( $class_name ) {
		return self::table()
			->where( 'model', $class_name )
			->orderBy( 'id' )
			->get( array( 'related_model', 'type', 'method_name' ) )
			->map(
				function ( $row ) {
					return array(
						'related_model' => $row->related_model,
						'type'          => $row->type,
						'method_name'   => $row->method_name,
					);
				}
			)
			->all();
	}

	/**
	 * Look up one of a model's relationships by its (auto-derived) method
	 * name -- what Model_Fields::add() uses to validate a Relate to One/
	 * Relate to Many field's chosen relationship (must exist, and must be
	 * the matching type -- belongsTo/belongsToMany) before deriving that
	 * field's own real column (or lack of one).
	 *
	 * @param string $class_name  Model class name.
	 * @param string $method_name Relationship's method_name.
	 * @return array{related_model:string,type:string,method_name:string}|null
	 */
	public static function find( $class_name, $method_name ) {
		foreach ( self::all( $class_name ) as $relationship ) {
			if ( $relationship['method_name'] === $method_name ) {
				return $relationship;
			}
		}

		return null;
	}

	/**
	 * Every relationship type the Relationship Editor's own type dropdown
	 * needs -- key/label -- without duplicating TYPES' own contents in
	 * JavaScript.
	 *
	 * @return array<int,array{key:string,label:string}>
	 */
	public static function describe_types() {
		$described = array();

		foreach ( self::TYPES as $key => $type ) {
			$described[] = array(
				'key'   => $key,
				'label' => $type['label'],
			);
		}

		return $described;
	}

	/**
	 * Add a relationship: $class_name gets a new method (named
	 * automatically -- see derive_method_name()) returning
	 * `$this->{$type}( \{$related_model}::class )`. Pure metadata --
	 * no migration, unlike Model_Fields::add().
	 *
	 * @param string $class_name    Owning model class name.
	 * @param string $related_model Related model class name -- must
	 *                                already be a real, registered model,
	 *                                and can't be $class_name itself (the
	 *                                admin app's own model picker already
	 *                                excludes it; this is the same check
	 *                                enforced server-side).
	 * @param string $type          One of self::TYPES' own keys.
	 * @return array{related_model:string,type:string,method_name:string}|\WP_Error
	 */
	public static function add( $class_name, $related_model, $type ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$related_model = self::require_related_model( $class_name, $related_model );

		if ( is_wp_error( $related_model ) ) {
			return $related_model;
		}

		if ( ! isset( self::TYPES[ $type ] ) ) {
			return new \WP_Error(
				'gateway_relationship_invalid_type',
				sprintf(
					/* translators: %s: comma-separated list of valid types */
					__( 'Relationship type must be one of: %s.', 'gateway' ),
					implode( ', ', array_keys( self::TYPES ) )
				),
				array( 'status' => 400 )
			);
		}

		$method_name = self::derive_method_name( $related_model, $type );

		foreach ( self::all( $class_name ) as $existing ) {
			if ( $existing['method_name'] === $method_name ) {
				return new \WP_Error(
					'gateway_relationship_exists',
					sprintf(
						/* translators: %s: method name */
						__( 'A relationship method named "%s()" already exists on this model -- likely a second relationship to the same model.', 'gateway' ),
						$method_name
					),
					array( 'status' => 409 )
				);
			}
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		// Must exist before the relationship is usable at all -- see this
		// class's own docblock for why every one of these is an exception
		// to "never touches EITHER model's own table" (a `belongsToMany`
		// needs a third table; the other three need a real FK column
		// somewhere). Every one of these is idempotent (a second
		// relationship that would need the exact same table/column --
		// e.g. the same `belongsToMany` declared from the other direction
		// too -- reuses what's already there rather than erroring), and a
		// failure here must actually stop the relationship from being
		// recorded (checked, never just called and ignored) -- otherwise
		// a failed migration still leaves a relationship row behind that
		// looks usable but points at schema that was never created; see
		// this class's own docblock for the reported bug this fixes.
		if ( 'belongsToMany' === $type ) {
			$schema_result = self::ensure_pivot_table( $class_name, $related_model );
		} elseif ( 'belongsTo' === $type ) {
			// The FK column lives on $class_name's own table -- named
			// after the relationship's own method_name (matching
			// Eloquent's real `belongsTo()` default,
			// `Str::snake( $relation ) . '_id'`, confirmed against
			// `HasRelationships::belongsTo()`), exactly the same
			// derivation Model_Fields::derive_relationship_field_name()
			// uses for a Relate to One field bound to this relationship --
			// guaranteed to match by sharing this one derivation, not by
			// coincidence.
			$schema_result = self::ensure_foreign_key_column( $class_name, self::belongs_to_foreign_key( $method_name ) );
		} elseif ( in_array( $type, array( 'hasOne', 'hasMany' ), true ) ) {
			// The FK column lives on $related_model's own table instead --
			// named after $class_name's OWN class name (Eloquent's real
			// `hasOne()`/`hasMany()` default, `Str::snake( class_basename(
			// $this ) ) . '_id'`, confirmed against `HasRelationships::
			// hasOneOrMany()`) -- independent of method_name entirely
			// (unlike belongsTo above), and independent of whether the
			// *other* side ever declares its own inverse `belongsTo` at
			// all.
			$schema_result = self::ensure_foreign_key_column( $related_model, \Illuminate\Support\Str::snake( $class_name ) . '_id' );
		} else {
			$schema_result = true;
		}

		if ( is_wp_error( $schema_result ) ) {
			return $schema_result;
		}

		self::table()->insert(
			array(
				'model'         => $class_name,
				'related_model' => $related_model,
				'type'          => $type,
				'method_name'   => $method_name,
				'created_at'    => current_time( 'mysql' ),
				'updated_at'    => current_time( 'mysql' ),
			)
		);

		$relationship = array(
			'related_model' => $related_model,
			'type'          => $type,
			'method_name'   => $method_name,
		);

		// Same "DB row first, file second" ordering Model_Fields uses --
		// a rewrite failure is reported but non-fatal, since the
		// relationship itself is already safely recorded either way.
		$rewrite_result = Model_Builder::rewrite_model_file(
			$class_name,
			$model->getTable(),
			Model_Fields::all( $class_name ),
			self::all( $class_name )
		);

		if ( is_wp_error( $rewrite_result ) ) {
			$relationship['warnings'] = array( $rewrite_result->get_error_message() );
		}

		return $relationship;
	}

	/**
	 * Remove a relationship by its (auto-derived) method name.
	 *
	 * @param string $class_name  Owning model class name.
	 * @param string $method_name The relationship's method_name.
	 * @return true|\WP_Error
	 */
	public static function remove( $class_name, $method_name ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$relationship = self::find( $class_name, $method_name );

		if ( ! $relationship ) {
			return new \WP_Error(
				'gateway_relationship_not_found',
				__( 'Relationship not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		// A Relate to One/Relate to Many field (Model_Fields) is bound to
		// this exact relationship -- removing it out from under that field
		// would leave the field pointing at a relationship method that no
		// longer exists on the generated model file. The field must be
		// removed first (its own remove() has no such reverse dependency
		// to worry about).
		foreach ( Model_Fields::all( $class_name ) as $field ) {
			if ( $method_name === $field['relationship_method'] ) {
				return new \WP_Error(
					'gateway_relationship_in_use',
					sprintf(
						/* translators: %s: field label */
						__( 'Remove the "%s" field first -- it depends on this relationship.', 'gateway' ),
						$field['label']
					),
					array( 'status' => 409 )
				);
			}
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		self::table()
			->where( 'model', $class_name )
			->where( 'method_name', $method_name )
			->delete();

		// The FK column this relationship needed (add()'s own eager
		// creation, above) is dropped too, but only if nothing else still
		// needs it -- see drop_foreign_key_column_if_unused()'s own
		// docblock for the full "what else could still need it" check.
		// `belongsToMany`'s pivot table is deliberately excluded from
		// this cleanup entirely, same as always: a whole shared table,
		// not a single column one specific other relationship could also
		// derive, so there's even less signal here to tell whether
		// dropping it is actually safe.
		if ( 'belongsToMany' !== $relationship['type'] ) {
			$required = self::required_foreign_key_for( $class_name, $relationship );

			if ( $required ) {
				self::drop_foreign_key_column_if_unused( $required[0], $required[1] );
			}
		}

		// Not surfaced as a warning here (same reasoning as
		// Model_Fields::remove()) -- removing the relationship succeeded
		// regardless, whether or not its own schema cleanup did too.
		Model_Builder::rewrite_model_file(
			$class_name,
			$model->getTable(),
			Model_Fields::all( $class_name ),
			self::all( $class_name )
		);

		return true;
	}

	/**
	 * Deletes every relationship row recorded for a model -- called by
	 * Model_Builder::rename() when retiring the old class, for the same
	 * "a renamed model starts fresh" reason Model_Fields::forget() exists.
	 *
	 * Known limitation (documented, not fixed, in this first draft): this
	 * only forgets $class_name's *own* relationships -- another model's
	 * relationship whose related_model pointed at $class_name is left
	 * referencing a class name that no longer exists. A future version
	 * could cascade that cleanup too; not done here to keep a rename's
	 * own blast radius limited to the model actually being renamed.
	 *
	 * @param string $class_name Model class name.
	 */
	public static function forget( $class_name ) {
		self::table()->where( 'model', $class_name )->delete();
	}

	/**
	 * Creates the pivot table a `belongsToMany` relationship between
	 * these two models needs to function at all, if it doesn't already
	 * exist -- see this class's own docblock for why this is the one
	 * exception to "a relationship never touches schema."
	 *
	 * Runs as a real, generated-and-run migration -- a file under
	 * `wp-content/gateway/migrations`, registered with `Migration_Registry`,
	 * executed via `Migration_Runner::run()` -- the exact same mechanism
	 * `Model_Fields::add()`/`update()`/`remove()` already use for a
	 * column change, rather than an inline `Schema::create()` call made
	 * directly here. An earlier version of this method did exactly that
	 * inline call: it went unrecorded anywhere Migration_Registry/the
	 * migrations directory could account for it, and its own caller
	 * (`add()`, above) didn't even check whether it had actually
	 * succeeded before recording the relationship -- together, a failure
	 * here (of any kind) could leave a relationship looking fully set up
	 * while the table it depends on was never created, exactly the
	 * `Base table or view not found` failure this was reported as.
	 * Routing through a real migration -- generate, register, run, and
	 * only report success once `Migration_Runner::run()` itself confirms
	 * it -- makes that failure mode visible (an actual `\WP_Error` back to
	 * the Relationship Editor) instead of silent.
	 *
	 * Table/column names computed to match Eloquent's own default
	 * `belongsToMany()` convention exactly (confirmed against
	 * `Illuminate\Database\Eloquent\Concerns\HasRelationships::
	 * joiningTable()`/`joiningTableSegment()`): both models' own class
	 * names, snake_cased, sorted alphabetically, joined with an
	 * underscore for the table (e.g. "Make" + "Model" -> "make_model");
	 * each one's own snake_cased name + "_id" for its own pivot column
	 * (e.g. "make_id"/"model_id"). This is exactly what `$this->belongsToMany(
	 * \Model::class )` (no explicit table/key arguments -- see
	 * Model_Builder::relationship_method(), which never adds any) resolves
	 * to on its own, so nothing about the generated relationship method
	 * itself needs to know this table even exists.
	 *
	 * @param string $class_a One side's model class name.
	 * @param string $class_b The other side's model class name.
	 * @return string|\WP_Error The pivot table's name on success.
	 */
	private static function ensure_pivot_table( $class_a, $class_b ) {
		$table_name = self::pivot_table_name( $class_a, $class_b );

		// Idempotent -- a second belongsToMany between the same two
		// models (declared from either direction) reuses the same table
		// rather than generating (or running) a migration for it again.
		if ( \Illuminate\Database\Capsule\Manager::schema()->hasTable( $table_name ) ) {
			return $table_name;
		}

		$column_a = \Illuminate\Support\Str::snake( $class_a ) . '_id';
		$column_b = \Illuminate\Support\Str::snake( $class_b ) . '_id';

		$up_body   = "\t\tSchema::create( '{$table_name}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {\n"
			. "\t\t\t\$table->id();\n"
			. "\t\t\t\$table->unsignedBigInteger( '{$column_a}' );\n"
			. "\t\t\t\$table->unsignedBigInteger( '{$column_b}' );\n"
			. "\t\t\t\$table->timestamps();\n"
			. "\t\t} );";
		$down_body = "\t\tSchema::dropIfExists( '{$table_name}' );";

		$migration_result = self::generate_and_run_migration(
			'Create' . \Illuminate\Support\Str::studly( $table_name ) . 'PivotTable',
			$up_body,
			$down_body
		);

		if ( is_wp_error( $migration_result ) ) {
			return $migration_result;
		}

		return $table_name;
	}

	/**
	 * Generates one migration file (a unique, version-suffixed class name),
	 * runs it, and cleans up (file + registration) if that run fails --
	 * the pivot-table counterpart of `Model_Fields`' own private method of
	 * the same name (identical mechanism, different caller); see
	 * `ensure_pivot_table()`'s own docblock for why this exists instead of
	 * a bare inline `Schema::create()` call.
	 *
	 * @param string $class_name_prefix Base for the migration class name,
	 *                                   e.g. "CreateEventTicketPivotTable"
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
				'gateway_relationship_migration_exists',
				__( 'Could not generate a unique migration for this relationship -- please try again.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		if ( false === file_put_contents( $migration_path, self::migration_template( $migration_class, $version, $up_body, $down_body ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error(
				'gateway_relationship_write_failed',
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
 * Gateway-generated migration -- created by the Relationship Editor.
 * Run automatically once, immediately after being generated.
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
	 * @param string $class_a One side's model class name.
	 * @param string $class_b The other side's model class name.
	 * @return string Eloquent's own default pivot table name for these
	 *                 two models -- see ensure_pivot_table()'s own docblock.
	 */
	private static function pivot_table_name( $class_a, $class_b ) {
		$segments = array(
			\Illuminate\Support\Str::snake( $class_a ),
			\Illuminate\Support\Str::snake( $class_b ),
		);

		sort( $segments );

		return implode( '_', $segments );
	}

	/**
	 * The real FK column name Eloquent's own `belongsTo()` default
	 * convention expects for a relationship with this method name --
	 * confirmed against `Illuminate\Database\Eloquent\Concerns\
	 * HasRelationships::belongsTo()`: the foreign key defaults to the
	 * calling method's own name, snake-cased, plus "_" and the related
	 * model's own primary key name (always "id" here). The one single
	 * place this is derived -- both ensure_foreign_key_column() (add()'s
	 * own eager creation, above) and Model_Fields::
	 * derive_relationship_field_name() (a Relate to One field's own real
	 * column name) call this, so the two can never independently drift
	 * apart into naming two different columns for what's supposed to be
	 * the exact same one.
	 *
	 * @param string $method_name Relationship's method_name.
	 * @return string
	 */
	public static function belongs_to_foreign_key( $method_name ) {
		return \Illuminate\Support\Str::snake( $method_name ) . '_id';
	}

	/**
	 * Creates the real FK column a `belongsTo`/`hasOne`/`hasMany`
	 * relationship needs to actually be usable at all, on whichever
	 * side Eloquent's own default convention puts it (see add()'s own
	 * call sites for which side that is, per type) -- if it doesn't
	 * already exist. Runs as a real, generated-and-run migration, the
	 * same mechanism ensure_pivot_table() already uses (see that
	 * method's own docblock for why -- the same reasoning applies here:
	 * a bare inline Schema::table() call went unrecorded anywhere
	 * Migration_Registry/the migrations directory could account for it).
	 *
	 * Idempotent for the same reason ensure_pivot_table() is: a second
	 * thing that would need this exact same column (most likely: a
	 * Relate to One field later bound to this exact `belongsTo`
	 * relationship, via Model_Fields::add() -- see that method's own
	 * migration guard for the other half of this) reuses it rather than
	 * erroring. Nullable, like every other Gateway-managed column this
	 * plugin ever adds on a site owner's behalf -- there's no way to
	 * know in advance whether every existing row should be required to
	 * already have a value.
	 *
	 * @param string $model_class Class name whose own table gets the column.
	 * @param string $column_name Column name.
	 * @return true|\WP_Error
	 */
	private static function ensure_foreign_key_column( $model_class, $column_name ) {
		$model  = new $model_class();
		$table  = $model->getTable();
		$schema = \Illuminate\Database\Capsule\Manager::schema();

		if ( $schema->hasColumn( $table, $column_name ) ) {
			return true;
		}

		$up_body   = "\t\tSchema::table( '{$table}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {\n"
			. "\t\t\t\$table->unsignedBigInteger( '{$column_name}' )->nullable();\n"
			. "\t\t} );";
		$down_body = "\t\tSchema::table( '{$table}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {\n"
			. "\t\t\t\$table->dropColumn( '{$column_name}' );\n"
			. "\t\t} );";

		$migration_result = self::generate_and_run_migration(
			'Add' . \Illuminate\Support\Str::studly( $column_name ) . 'To' . \Illuminate\Support\Str::studly( $table ) . 'Table',
			$up_body,
			$down_body
		);

		if ( is_wp_error( $migration_result ) ) {
			return $migration_result;
		}

		return true;
	}

	/**
	 * Which (owning class, column name) a single `belongsTo`/`hasOne`/
	 * `hasMany` relationship needs -- the exact same derivation add()'s
	 * own `ensure_foreign_key_column()` call sites use, factored out so
	 * remove()'s own cleanup (below) can ask the identical question
	 * about a relationship it's about to delete, and so
	 * drop_foreign_key_column_if_unused() can ask it again about every
	 * *other* relationship still on file when deciding whether dropping
	 * is actually safe.
	 *
	 * @param string $owning_class The model this relationship belongs to
	 *                              (i.e. whatever `all( $owning_class )`
	 *                              this relationship came from).
	 * @param array  $relationship {related_model, type, method_name}.
	 * @return array{0:string,1:string}|null [table-owning class, column name],
	 *                or null for `belongsToMany` (no single column -- a
	 *                whole pivot table instead, handled separately) or an
	 *                unrecognized type.
	 */
	private static function required_foreign_key_for( $owning_class, array $relationship ) {
		if ( 'belongsTo' === $relationship['type'] ) {
			return array( $owning_class, self::belongs_to_foreign_key( $relationship['method_name'] ) );
		}

		if ( in_array( $relationship['type'], array( 'hasOne', 'hasMany' ), true ) ) {
			return array( $relationship['related_model'], \Illuminate\Support\Str::snake( $owning_class ) . '_id' );
		}

		return null;
	}

	/**
	 * Every relationship currently recorded, across every model -- not
	 * scoped to any one model's own `all( $class_name )`, since deciding
	 * whether a column is still needed (drop_foreign_key_column_if_unused()'s
	 * own job) means checking every relationship that could possibly
	 * derive that exact same column, and that isn't necessarily limited
	 * to the two models the relationship being removed involves (a
	 * `hasOne`/`hasMany`'s own FK column lives on the *related* model's
	 * table, so another, unrelated model could independently declare its
	 * own `hasOne`/`hasMany` pointing at that same related model with a
	 * *different* resulting column -- harmless -- but a `belongsTo`
	 * declared the other direction, or a second `hasOne`/`hasMany` between
	 * the exact same pair, needs checking regardless of which side
	 * "started" it). `gateway_relationships` is small (one row per
	 * relationship an entire site has configured) -- a full scan here
	 * costs nothing that matters, and no reverse index has to be kept in
	 * sync to make this cheaper.
	 *
	 * @return array<int,array{0:string,1:array{related_model:string,type:string,method_name:string}}>
	 *              Each entry: [owning class, {related_model, type, method_name}].
	 */
	private static function all_relationships_everywhere() {
		return self::table()
			->orderBy( 'id' )
			->get( array( 'model', 'related_model', 'type', 'method_name' ) )
			->map(
				function ( $row ) {
					return array(
						$row->model,
						array(
							'related_model' => $row->related_model,
							'type'          => $row->type,
							'method_name'   => $row->method_name,
						),
					);
				}
			)
			->all();
	}

	/**
	 * Drops a `belongsTo`/`hasOne`/`hasMany` relationship's own FK
	 * column, via a real generated-and-run migration (the drop
	 * counterpart to ensure_foreign_key_column()) -- but only once
	 * confirmed that nothing else still needs it:
	 *
	 * - A real field (plain, or a Relate to One bound to some *other*
	 *   relationship -- one bound to the relationship actually being
	 *   removed already blocked reaching this point at all, in remove()
	 *   itself) still named exactly this.
	 * - Any *other* still-recorded relationship, anywhere, that would
	 *   independently derive this exact same (table, column) pair --
	 *   the real scenario this guards: `Event hasMany Ticket` and
	 *   `Ticket belongsTo Event` are two independent relationship rows
	 *   that happen to share the identical physical FK column
	 *   (`tickets.event_id`) by Eloquent's own convention; removing
	 *   either one alone must never drop a column the other one still
	 *   needs to function.
	 *
	 * Silently does nothing (never returns an error, since remove()
	 * itself already succeeded regardless) if the column turns out to
	 * still be needed, doesn't exist at all, or the drop migration
	 * itself fails for some reason -- same "removal succeeded either
	 * way" non-fatal treatment remove()'s own model-file rewrite already
	 * gets.
	 *
	 * @param string $table_owner_class Class name whose own table the column lives on.
	 * @param string $column_name       Column name.
	 */
	private static function drop_foreign_key_column_if_unused( $table_owner_class, $column_name ) {
		foreach ( Model_Fields::all( $table_owner_class ) as $field ) {
			if ( $field['name'] === $column_name ) {
				return;
			}
		}

		foreach ( self::all_relationships_everywhere() as list( $owning_class, $other_relationship ) ) {
			$required = self::required_foreign_key_for( $owning_class, $other_relationship );

			if ( $required && $required[0] === $table_owner_class && $required[1] === $column_name ) {
				return;
			}
		}

		if ( ! class_exists( $table_owner_class ) ) {
			return;
		}

		$model  = new $table_owner_class();
		$table  = $model->getTable();
		$schema = \Illuminate\Database\Capsule\Manager::schema();

		if ( ! $schema->hasColumn( $table, $column_name ) ) {
			return;
		}

		$up_body   = "\t\tSchema::table( '{$table}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {\n"
			. "\t\t\t\$table->dropColumn( '{$column_name}' );\n"
			. "\t\t} );";
		$down_body = "\t\tSchema::table( '{$table}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {\n"
			. "\t\t\t\$table->unsignedBigInteger( '{$column_name}' )->nullable();\n"
			. "\t\t} );";

		self::generate_and_run_migration(
			'Remove' . \Illuminate\Support\Str::studly( $column_name ) . 'From' . \Illuminate\Support\Str::studly( $table ) . 'Table',
			$up_body,
			$down_body
		);
	}

	/**
	 * @param string $related_model Related model class name.
	 * @param string $type          One of self::TYPES' own keys.
	 * @return string e.g. "model"/"models" -- see this class's own
	 *                docblock.
	 */
	private static function derive_method_name( $related_model, $type ) {
		$name = \Illuminate\Support\Str::camel( $related_model );

		return self::TYPES[ $type ]['plural'] ? \Illuminate\Support\Str::plural( $name ) : $name;
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
	 * Validates a related model: must be a real, registered model, and
	 * can't be $class_name itself -- a relationship to oneself isn't
	 * offered by the admin app's own model picker (it only lists every
	 * *other* model), and is rejected here too rather than only trusted
	 * to have been excluded client-side.
	 *
	 * @param string $class_name    Owning model class name.
	 * @param string $related_model Raw related model class name.
	 * @return string|\WP_Error The related model class name on success.
	 */
	private static function require_related_model( $class_name, $related_model ) {
		$related_model = trim( (string) $related_model );

		if ( $related_model === $class_name ) {
			return new \WP_Error(
				'gateway_relationship_self',
				__( 'A model can\'t have a relationship to itself.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		if ( '' === $related_model || ! Model_Registry::has( $related_model ) || ! class_exists( $related_model ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Related model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		return $related_model;
	}

	/**
	 * @return \WP_Error
	 */
	private static function unavailable_error() {
		return new \WP_Error(
			'gateway_database_unavailable',
			__( 'The database connection isn\'t currently working -- check the Database Connection screen before editing relationships.', 'gateway' ),
			array( 'status' => 503 )
		);
	}
}
