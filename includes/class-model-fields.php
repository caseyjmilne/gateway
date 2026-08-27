<?php
/**
 * Field definitions for generated models -- what the admin app's Field
 * Editor (on a model's detail screen) manages. A model's own generated
 * getFields() method (see Model_Builder::model_template()) just calls
 * all( static::class ) here every time it's invoked -- editing a field's
 * *metadata* never needs to touch or regenerate the model's own PHP file
 * the way a Title/table rename does.
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
 * A model's fields are stored as one flat array of field arrays --
 * deliberately never split into parallel arrays keyed by property (no
 * {names: [...], types: [...]} shape): two fields simply sit as
 * neighbors in the same array, each one a plain {name, type}. This is
 * also exactly the shape a model's own getFillable() override needs:
 * array_column( getFields(), 'name' ).
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Fields {

	/**
	 * Option name the field definitions are stored under: class name =>
	 * flat array of {name, type} field arrays.
	 */
	const OPTION = 'gateway_model_fields';

	/**
	 * Column names every generated model's own initial migration already
	 * creates -- never valid as a field name, since that would collide
	 * with a real column create()/Model_Builder's own migration already
	 * added.
	 */
	const RESERVED_NAMES = array( 'id', 'created_at', 'updated_at' );

	/**
	 * @param string $class_name Model class name.
	 * @return array<int,array{name:string,type:string}>
	 */
	public static function all( $class_name ) {
		$fields = get_option( self::OPTION, array() );

		return isset( $fields[ $class_name ] ) && is_array( $fields[ $class_name ] )
			? $fields[ $class_name ]
			: array();
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
	 * @return array{name:string,type:string}|\WP_Error The added field
	 *              (with its sanitized name) on success.
	 */
	public static function add( $class_name, $name, $type ) {
		$model = self::require_model( $class_name );

		if ( is_wp_error( $model ) ) {
			return $model;
		}

		$field = self::validate( $class_name, $name, $type, null );

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

		$model_fields   = self::all( $class_name );
		$model_fields[] = $field;
		self::save( $class_name, $model_fields );

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
	 * @return array{name:string,type:string}|\WP_Error
	 */
	public static function update( $class_name, $current_name, $name, $type ) {
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
		$new_field = self::validate( $class_name, $name, $type, $current_name );

		if ( is_wp_error( $new_field ) ) {
			return $new_field;
		}

		$name_changed = $old_field['name'] !== $new_field['name'];
		$type_changed = $old_field['type'] !== $new_field['type'];

		if ( ! $name_changed && ! $type_changed ) {
			return $old_field;
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		$table = $model->getTable();
		$up    = array();
		$down  = array();

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

		$model_fields[ $index ] = $new_field;
		self::save( $class_name, $model_fields );

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

		array_splice( $model_fields, $index, 1 );
		self::save( $class_name, $model_fields );

		return true;
	}

	/**
	 * @param string $class_name Model class name.
	 */
	public static function forget( $class_name ) {
		$all_fields = get_option( self::OPTION, array() );

		if ( isset( $all_fields[ $class_name ] ) ) {
			unset( $all_fields[ $class_name ] );
			update_option( self::OPTION, $all_fields );
		}
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
	 * @param string $class_name   Model class name.
	 * @param array  $model_fields Updated flat field array.
	 */
	private static function save( $class_name, array $model_fields ) {
		$all_fields                = get_option( self::OPTION, array() );
		$all_fields[ $class_name ] = $model_fields;
		update_option( self::OPTION, $all_fields );
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
	 * @return array{name:string,type:string}|\WP_Error
	 */
	private static function validate( $class_name, $name, $type, $ignore_name ) {
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

		return array(
			'name' => $sanitized_name,
			'type' => $type,
		);
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
