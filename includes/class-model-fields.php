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
	 * @param string $class_name Model class name.
	 * @return array<int,array{name:string,label:string,type:string,position:int}>
	 */
	public static function all( $class_name ) {
		return self::table()
			->where( 'model', $class_name )
			->orderBy( 'position' )
			->orderBy( 'id' )
			->get( array( 'name', 'label', 'type', 'position' ) )
			->map(
				function ( $row ) {
					return array(
						'name'     => $row->name,
						// A row recorded before the label column existed
						// (or saved with one left blank) has no label of
						// its own yet -- fall back to the same
						// auto-derived default validate() would give it.
						'label'    => ! empty( $row->label ) ? $row->label : self::default_label( $row->name ),
						'type'     => $row->type,
						'position' => (int) $row->position,
					);
				}
			)
			->all();
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
	 * Add a new field: generates and runs an ADD COLUMN migration for it
	 * first, and only records the field's metadata once that has
	 * actually succeeded.
	 *
	 * @param string $class_name Model class name.
	 * @param string $name       Raw field name -- sanitized to a
	 *                            lowercase snake_case machine name, which
	 *                            becomes the real column name too.
	 * @param string $type       One of Field_Type_Registry::keys().
	 * @param string $label      Display label; blank defaults to a
	 *                            title-cased version of the (sanitized)
	 *                            name -- see this class's own docblock.
	 * @return array{name:string,label:string,type:string,position:int}|\WP_Error
	 *              The added field (with its sanitized name) on success --
	 *              always appended after every existing field.
	 */
	public static function add( $class_name, $name, $type, $label = '' ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$field = self::validate( $class_name, $name, $type, null, $label );

		if ( is_wp_error( $field ) ) {
			return $field;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$table       = $model->getTable();
		$type_class  = Field_Type_Registry::get( $field['type'] );
		$method      = $type_class::blueprint_method();

		$up_body   = self::column_statement( $table, "\$table->{$method}( '{$field['name']}' )->nullable();" );
		$down_body = self::column_statement( $table, "\$table->dropColumn( '{$field['name']}' );" );

		$migration_result = self::generate_and_run_migration( "Add{$field['name']}To{$table}Table", $up_body, $down_body );

		if ( is_wp_error( $migration_result ) ) {
			return $migration_result;
		}

		// Always appended after every existing field -- max() returns null
		// when this is the model's first field, which is exactly position
		// 0, not "null + 1".
		$max_position       = self::table()->where( 'model', $class_name )->max( 'position' );
		$field['position']  = null === $max_position ? 0 : ( (int) $max_position + 1 );

		self::table()->insert(
			array(
				'model'      => $class_name,
				'name'       => $field['name'],
				'label'      => $field['label'],
				'type'       => $field['type'],
				'position'   => $field['position'],
				'created_at' => current_time( 'mysql' ),
				'updated_at' => current_time( 'mysql' ),
			)
		);

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
	 * @return array{name:string,label:string,type:string,position:int}|\WP_Error
	 */
	public static function update( $class_name, $current_name, $name, $type, $label = '' ) {
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

		if ( ! $name_changed && ! $type_changed && ! $label_changed ) {
			return $old_field;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$table = $model->getTable();

		// A label-only change never touches the schema -- there's no
		// column to rename, nothing to migrate -- so it skips straight to
		// recording the new metadata below, the same way a truly no-op
		// update (caught above) skips it entirely.
		if ( ! $name_changed && ! $type_changed ) {
			return self::save_updated_field( $class_name, $table, $old_field['name'], $new_field );
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

		return self::save_updated_field( $class_name, $table, $old_field['name'], $new_field );
	}

	/**
	 * Shared tail end of update(): records the new name/label/type against
	 * the field's existing row (found by its *current* name, which may
	 * itself be one of the values changing) and rewrites the model file --
	 * used both after a schema-changing update (name and/or type changed,
	 * migration already run) and for a label-only one (nothing to migrate
	 * at all, see update()'s own early return for that case).
	 *
	 * @param string $class_name   Model class name.
	 * @param string $table        Table name.
	 * @param string $current_name The field's existing row, found by name.
	 * @param array  $new_field    {name, label, type} to save.
	 * @return array{name:string,label:string,type:string}|\WP_Error
	 */
	private static function save_updated_field( $class_name, $table, $current_name, array $new_field ) {
		self::table()
			->where( 'model', $class_name )
			->where( 'name', $current_name )
			->update(
				array(
					'name'       => $new_field['name'],
					'label'      => $new_field['label'],
					'type'       => $new_field['type'],
					'updated_at' => current_time( 'mysql' ),
				)
			);

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

		$up_body   = self::column_statement( $table, "\$table->dropColumn( '{$field['name']}' );" );
		$down_body = self::column_statement( $table, "\$table->{$method}( '{$field['name']}' )->nullable();" );

		$migration_result = self::generate_and_run_migration( "Remove{$field['name']}From{$table}Table", $up_body, $down_body );

		if ( is_wp_error( $migration_result ) ) {
			return $migration_result;
		}

		self::table()
			->where( 'model', $class_name )
			->where( 'name', $field['name'] )
			->delete();

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
		self::table()->where( 'model', $class_name )->delete();
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
