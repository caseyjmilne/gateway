<?php
/**
 * Turns a single "Title" (from the admin app's Models screen) into a
 * working Eloquent model: a generated model class, a generated migration
 * that creates its table, both written to wp-content/gateway/{models,
 * migrations}, loaded and registered immediately, and -- unlike a normal
 * Laravel workflow, where `artisan migrate` is a separate, deliberate step
 * -- the migration is run immediately too, so the table exists by the time
 * this returns. A future admin screen will let migrations be run on
 * demand (see Migration_Runner); this is the one case where Gateway runs
 * one on its own, because a model with no table yet isn't usable for
 * anything.
 *
 * Generated files are deliberately unnamespaced, and reference Illuminate
 * classes by fully-qualified name (`\Illuminate\...`) rather than `use`
 * imports -- avoids any chance of a title like "Model" or "Migration"
 * producing a class that collides with an import of the same name in its
 * own file (`class Model extends Model` from `use ... as Model;` would be
 * a fatal error). Matches classic (pre-namespaced) Laravel migration
 * stubs, which took the same unnamespaced approach for the same reason:
 * files that get dropped into a shared location by name, not composed
 * into an app's own namespace tree.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Builder {

	/**
	 * Option name the next migration version number is stored under -- a
	 * single, plugin-wide, monotonically increasing counter (not
	 * per-table), so "version 4" unambiguously identifies one specific
	 * migration regardless of which table it belongs to.
	 */
	const OPTION_NEXT_VERSION = 'gateway_next_migration_version';

	/**
	 * Create a model: derive its class/table name from $title (and,
	 * optionally, $plural_title), write the model + migration files, load
	 * and register both classes, and run the migration -- the table
	 * exists by the time this returns successfully.
	 *
	 * @param string $title        Free-text title, e.g. "Blog Post".
	 * @param string $plural_title Optional free-text plural, e.g.
	 *                              "Tickets" for a "Ticket" title -- used
	 *                              for the table name instead of
	 *                              auto-pluralizing $title. Blank falls
	 *                              back to auto-pluralizing (Str::
	 *                              pluralStudly()), which gets irregular
	 *                              plurals right most of the time but not
	 *                              always (and can't guess a domain-specific
	 *                              preference at all) -- this is the escape
	 *                              hatch for when it doesn't.
	 * @return array{class:string,table:string,migration_class:string,migration_version:int}|\WP_Error
	 */
	public static function create( $title, $plural_title = '' ) {
		$title = trim( (string) $title );

		if ( '' === $title ) {
			return new \WP_Error(
				'gateway_model_title_required',
				__( 'Please enter a title.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		$class_name = self::class_name_from_title( $title );

		if ( '' === $class_name || ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]*$/', $class_name ) ) {
			return new \WP_Error(
				'gateway_model_invalid_title',
				__( 'Title must contain at least one letter.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		$plural_title = trim( (string) $plural_title );

		if ( '' !== $plural_title ) {
			$table_name = self::table_name_from_words( $plural_title );

			if ( '' === $table_name ) {
				return new \WP_Error(
					'gateway_model_invalid_plural_title',
					__( 'Plural Title must contain at least one letter.', 'gateway' ),
					array( 'status' => 400 )
				);
			}
		} else {
			$table_name = self::table_name_for_class( $class_name );
		}

		$migration_class = self::migration_class_for_table( $table_name );

		if ( class_exists( $class_name, false ) ) {
			return new \WP_Error(
				'gateway_model_exists',
				sprintf(
					/* translators: %s: model class name */
					__( 'A model named "%s" already exists.', 'gateway' ),
					$class_name
				),
				array( 'status' => 409 )
			);
		}

		if ( class_exists( $migration_class, false ) ) {
			// Reachable even with a class name that's otherwise free: the
			// table name (auto-pluralized, or from Plural Title) is what
			// the migration class is actually keyed on, and two different
			// titles can land on the same one -- e.g. "Ticket" and
			// "Support Ticket" both explicitly given the plural "Tickets".
			return new \WP_Error(
				'gateway_model_table_exists',
				sprintf(
					/* translators: %s: table name */
					__( 'A model already uses the table "%s" -- try a different Plural Title.', 'gateway' ),
					$table_name
				),
				array( 'status' => 409 )
			);
		}

		// Uses Database_Connection's own health-check cache (Database
		// Connection screen's "Test Connection" -- or any prior check --
		// populates it) rather than forcing a fresh connection attempt
		// here: creating a model is meant to fail fast with a clear reason
		// when the database is already known to be unreachable, not to add
		// yet another live connection attempt of its own on top of the one
		// the migration itself is about to make.
		if ( ! Database_Connection::is_healthy() ) {
			return new \WP_Error(
				'gateway_database_unavailable',
				__( 'The database connection isn\'t currently working -- check the Database Connection screen before adding a model.', 'gateway' ),
				array( 'status' => 503 )
			);
		}

		self::ensure_directories();

		$version         = self::next_migration_version();
		$model_path      = trailingslashit( GATEWAY_MODELS_DIR ) . $class_name . '.php';
		$migration_path  = trailingslashit( GATEWAY_MIGRATIONS_DIR ) . self::migration_filename( $version, $table_name );

		if ( file_exists( $model_path ) || file_exists( $migration_path ) ) {
			return new \WP_Error(
				'gateway_model_exists',
				sprintf(
					/* translators: %s: model class name */
					__( 'A model named "%s" already exists.', 'gateway' ),
					$class_name
				),
				array( 'status' => 409 )
			);
		}

		$written_model     = false === file_put_contents( $model_path, self::model_template( $class_name, $table_name ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		$written_migration = $written_model ? true : false === file_put_contents( $migration_path, self::migration_template( $migration_class, $table_name, $version ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents

		if ( $written_model || $written_migration ) {
			self::cleanup_files( $model_path, $migration_path );
			return new \WP_Error(
				'gateway_model_write_failed',
				__( 'Could not write the model/migration files -- check that wp-content/gateway is writable.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		require_once $model_path;
		require_once $migration_path;
		Model_Registry::register( $class_name );
		Migration_Registry::register( $migration_class );

		$run_result = Migration_Runner::run( $migration_class );

		if ( is_wp_error( $run_result ) ) {
			// The table was never created -- don't leave a model file
			// behind that looks usable but isn't backed by a real table.
			Model_Registry::unregister( $class_name );
			Migration_Registry::unregister( $migration_class );
			self::cleanup_files( $model_path, $migration_path );
			return $run_result;
		}

		return array(
			'class'              => $class_name,
			'table'              => $table_name,
			'migration_class'    => $migration_class,
			'migration_version'  => $version,
		);
	}

	/**
	 * Rename a model: derive the new class/table from $title/$plural_title
	 * exactly like create() does, generate the new model/migration/table,
	 * and only once that has actually succeeded, retire the old one --
	 * drop its table (via its own migration's down()), delete its files,
	 * and unregister both its classes. That ordering is deliberate: if
	 * anything about the new model fails, the old one is untouched rather
	 * than this leaving neither the old model nor a working new one behind.
	 *
	 * Renaming to the same effective class name (e.g. just a whitespace/
	 * case difference that sanitizes identically) is treated as a no-op
	 * success -- nothing is dropped or regenerated over a change that
	 * wouldn't actually change anything.
	 *
	 * @param string $old_class    Existing, registered model class name.
	 * @param string $title        New free-text title.
	 * @param string $plural_title Optional new free-text plural -- see
	 *                              create()'s own docblock.
	 * @return array{class:string,table:string,migration_class:string,migration_version:int,warnings?:string[]}|\WP_Error
	 */
	public static function rename( $old_class, $title, $plural_title = '' ) {
		if ( ! Model_Registry::has( $old_class ) || ! class_exists( $old_class ) ) {
			return new \WP_Error(
				'gateway_model_not_found',
				__( 'Model not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		$new_class_name = self::class_name_from_title( trim( (string) $title ) );

		if ( '' === $new_class_name || ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]*$/', $new_class_name ) ) {
			return new \WP_Error(
				'gateway_model_invalid_title',
				__( 'Title must contain at least one letter.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		$old_instance = new $old_class();
		$old_table    = $old_instance->getTable();
		$plural_title = trim( (string) $plural_title );

		if ( '' !== $plural_title ) {
			$new_table_name = self::table_name_from_words( $plural_title );

			if ( '' === $new_table_name ) {
				return new \WP_Error(
					'gateway_model_invalid_plural_title',
					__( 'Plural Title must contain at least one letter.', 'gateway' ),
					array( 'status' => 400 )
				);
			}
		} else {
			$new_table_name = self::table_name_for_class( $new_class_name );
		}

		// No real change -- the class *and* table this resolves to are
		// exactly what's already there (whether because nothing was
		// edited, or an edit sanitizes/auto-derives back to the same
		// thing) -- report the model as-is rather than dropping and
		// regenerating a table for nothing.
		if ( $new_class_name === $old_class && $new_table_name === $old_table ) {
			$old_migration_class = self::migration_class_for_table( $old_table );

			return array(
				'class'             => $old_class,
				'table'             => $old_table,
				'migration_class'   => $old_migration_class,
				'migration_version' => self::registered_migration_version( $old_migration_class ),
			);
		}

		if ( $new_class_name !== $old_class && class_exists( $new_class_name, false ) ) {
			return new \WP_Error(
				'gateway_model_exists',
				sprintf(
					/* translators: %s: model class name */
					__( 'A model named "%s" already exists.', 'gateway' ),
					$new_class_name
				),
				array( 'status' => 409 )
			);
		}

		// The Title is unchanged and only the Plural Title (table) is
		// different -- create()'s own "does this class already exist"
		// guard would wrongly reject reusing $old_class's own name (it's
		// still loaded, from before this call), since create() has no way
		// to know that's the point. retable() handles this narrower case
		// directly: a new migration/table for $new_table_name, the model
		// file rewritten to point at it, and the old table/migration
		// retired the same way as a full rename below -- without ever
		// generating a second, differently-named model file.
		if ( $new_class_name === $old_class ) {
			return self::retable( $old_class, $old_table, $new_table_name );
		}

		if ( ! Database_Connection::is_healthy() ) {
			return new \WP_Error(
				'gateway_database_unavailable',
				__( 'The database connection isn\'t currently working -- check the Database Connection screen before renaming a model.', 'gateway' ),
				array( 'status' => 503 )
			);
		}

		// Create the new model/migration/table first -- see this method's
		// own docblock for why the old one is only touched after this
		// succeeds.
		$created = self::create( $title, $plural_title );

		if ( is_wp_error( $created ) ) {
			return $created;
		}

		$warnings             = array();
		$old_migration_class  = self::migration_class_for_table( $old_table );

		if ( class_exists( $old_migration_class ) ) {
			$rollback_result = Migration_Runner::rollback( $old_migration_class );

			if ( is_wp_error( $rollback_result ) ) {
				// The new model already exists and works -- a failure
				// dropping the old table is reported, not fatal to the
				// rename as a whole (the site owner can drop it by hand;
				// silently leaving an orphaned table with no warning at
				// all would be worse).
				$warnings[] = sprintf(
					/* translators: 1: old table name, 2: error message */
					__( 'Could not drop the old table "%1$s": %2$s', 'gateway' ),
					$old_table,
					$rollback_result->get_error_message()
				);
			}
		}

		Model_Registry::unregister( $old_class );
		Migration_Registry::unregister( $old_migration_class );

		$old_model_path = trailingslashit( GATEWAY_MODELS_DIR ) . $old_class . '.php';

		if ( file_exists( $old_model_path ) ) {
			wp_delete_file( $old_model_path );
		}

		if ( class_exists( $old_migration_class ) ) {
			$old_version = self::registered_migration_version( $old_migration_class );

			if ( null !== $old_version ) {
				$old_migration_path = trailingslashit( GATEWAY_MIGRATIONS_DIR ) . self::migration_filename( $old_version, $old_table );

				if ( file_exists( $old_migration_path ) ) {
					wp_delete_file( $old_migration_path );
				}
			}
		}

		if ( $warnings ) {
			$created['warnings'] = $warnings;
		}

		return $created;
	}

	/**
	 * Handles the narrower case inside rename() where the Title (and so
	 * the class name) is unchanged and only the Plural Title (table) is
	 * different. create() can't be reused here -- its own "does this
	 * class already exist" guard would reject reusing $class's own name,
	 * since it has no way to know that's the point -- so this writes just
	 * a new migration for $new_table_name, runs it, rewrites the existing
	 * model file to point at the new table, and only then retires the old
	 * table/migration (same ordering rationale as rename() itself: the
	 * new table has to actually work before the old one is touched).
	 *
	 * @param string $class          Existing model class name (unchanged).
	 * @param string $old_table      Its current table name.
	 * @param string $new_table_name Its new table name.
	 * @return array{class:string,table:string,migration_class:string,migration_version:int,warnings?:string[]}|\WP_Error
	 */
	private static function retable( $class, $old_table, $new_table_name ) {
		$new_migration_class = self::migration_class_for_table( $new_table_name );

		if ( class_exists( $new_migration_class, false ) ) {
			return new \WP_Error(
				'gateway_model_table_exists',
				sprintf(
					/* translators: %s: table name */
					__( 'A model already uses the table "%s" -- try a different Plural Title.', 'gateway' ),
					$new_table_name
				),
				array( 'status' => 409 )
			);
		}

		if ( ! Database_Connection::is_healthy() ) {
			return new \WP_Error(
				'gateway_database_unavailable',
				__( 'The database connection isn\'t currently working -- check the Database Connection screen before renaming a model.', 'gateway' ),
				array( 'status' => 503 )
			);
		}

		self::ensure_directories();

		$version            = self::next_migration_version();
		$model_path         = trailingslashit( GATEWAY_MODELS_DIR ) . $class . '.php';
		$new_migration_path = trailingslashit( GATEWAY_MIGRATIONS_DIR ) . self::migration_filename( $version, $new_table_name );

		if ( file_exists( $new_migration_path ) ) {
			return new \WP_Error(
				'gateway_model_table_exists',
				sprintf(
					/* translators: %s: table name */
					__( 'A model already uses the table "%s" -- try a different Plural Title.', 'gateway' ),
					$new_table_name
				),
				array( 'status' => 409 )
			);
		}

		if ( false === file_put_contents( $new_migration_path, self::migration_template( $new_migration_class, $new_table_name, $version ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error(
				'gateway_model_write_failed',
				__( 'Could not write the migration file -- check that wp-content/gateway is writable.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		require_once $new_migration_path;
		Migration_Registry::register( $new_migration_class );

		$run_result = Migration_Runner::run( $new_migration_class );

		if ( is_wp_error( $run_result ) ) {
			Migration_Registry::unregister( $new_migration_class );

			if ( file_exists( $new_migration_path ) ) {
				wp_delete_file( $new_migration_path );
			}

			return $run_result;
		}

		// The new table exists and works -- point the model file at it.
		// The already-loaded $class object in this request keeps
		// reporting the old table if asked again (PHP can't redeclare a
		// class mid-request), but the next request's Directory_Loader
		// picks up this rewritten file fresh, same as any other file
		// change here.
		if ( false === file_put_contents( $model_path, self::model_template( $class, $new_table_name ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error(
				'gateway_model_write_failed',
				__( 'The new table was created, but the model file could not be updated -- check that wp-content/gateway is writable, then try again.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		$warnings             = array();
		$old_migration_class  = self::migration_class_for_table( $old_table );

		if ( class_exists( $old_migration_class ) ) {
			$rollback_result = Migration_Runner::rollback( $old_migration_class );

			if ( is_wp_error( $rollback_result ) ) {
				$warnings[] = sprintf(
					/* translators: 1: old table name, 2: error message */
					__( 'Could not drop the old table "%1$s": %2$s', 'gateway' ),
					$old_table,
					$rollback_result->get_error_message()
				);
			}

			Migration_Registry::unregister( $old_migration_class );

			$old_version = self::registered_migration_version( $old_migration_class );

			if ( null !== $old_version ) {
				$old_migration_path = trailingslashit( GATEWAY_MIGRATIONS_DIR ) . self::migration_filename( $old_version, $old_table );

				if ( file_exists( $old_migration_path ) ) {
					wp_delete_file( $old_migration_path );
				}
			}
		}

		$result = array(
			'class'              => $class,
			'table'              => $new_table_name,
			'migration_class'    => $new_migration_class,
			'migration_version'  => $version,
		);

		if ( $warnings ) {
			$result['warnings'] = $warnings;
		}

		return $result;
	}

	/**
	 * @param string $migration_class Migration class name.
	 * @return int|null The migration's own $version, or null if the class
	 *                   isn't loaded or declares none.
	 */
	private static function registered_migration_version( $migration_class ) {
		if ( ! class_exists( $migration_class ) ) {
			return null;
		}

		$instance = new $migration_class();

		return isset( $instance->version ) ? $instance->version : null;
	}

	/**
	 * The migration class name a given table's create-table migration
	 * always uses -- shared between create() (when generating it) and
	 * Model_REST_Controller (when looking it back up for a model it didn't
	 * itself just create), so the naming convention lives in exactly one
	 * place.
	 *
	 * @param string $table_name Table name, e.g. "blog_posts".
	 * @return string e.g. "CreateBlogPostsTable".
	 */
	public static function migration_class_for_table( $table_name ) {
		return 'Create' . \Illuminate\Support\Str::studly( $table_name ) . 'Table';
	}

	/**
	 * @param string $class_name Model class name, e.g. "BlogPost".
	 * @return string Table name, e.g. "blog_posts" -- same convention
	 *                Eloquent's own Model::getTable() would infer by
	 *                default, computed explicitly so the generated model
	 *                can set $table itself (see model_template()) and
	 *                never depend on that inference matching what the
	 *                migration actually created.
	 */
	private static function table_name_for_class( $class_name ) {
		return \Illuminate\Support\Str::snake( \Illuminate\Support\Str::pluralStudly( $class_name ) );
	}

	/**
	 * @param string $title Free-text title.
	 * @return string PascalCase class name, or '' if nothing alphanumeric
	 *                survives sanitizing (e.g. a title that's pure
	 *                punctuation).
	 */
	private static function class_name_from_title( $title ) {
		return \Illuminate\Support\Str::studly( self::sanitize_words( $title ) );
	}

	/**
	 * @param string $words Free-text plural, e.g. "Tickets".
	 * @return string snake_case table name, e.g. "tickets", or '' if
	 *                nothing alphanumeric survives sanitizing.
	 */
	private static function table_name_from_words( $words ) {
		return \Illuminate\Support\Str::snake( \Illuminate\Support\Str::studly( self::sanitize_words( $words ) ) );
	}

	/**
	 * Strip anything that isn't a letter, digit, space, hyphen, or
	 * underscore before studly/snake-casing -- Str::studly() only treats
	 * those last three as word separators, so stray punctuation would
	 * otherwise survive straight into a class or table name (e.g. "Foo!"
	 * would studly-case to "Foo!", not a valid PHP identifier).
	 *
	 * @param string $raw Free-text input.
	 * @return string
	 */
	private static function sanitize_words( $raw ) {
		return preg_replace( '/[^A-Za-z0-9 _-]+/', '', (string) $raw );
	}

	/**
	 * @param int    $version    Migration version number.
	 * @param string $table_name Table name.
	 * @return string e.g. "000004_create_blog_posts_table.php" -- the
	 *                zero-padded version prefix keeps a plain directory
	 *                listing in creation order, matching classic Laravel
	 *                migration filenames' own timestamp-prefix purpose.
	 */
	private static function migration_filename( $version, $table_name ) {
		return sprintf( '%06d_create_%s_table.php', $version, $table_name );
	}

	/**
	 * Claim the next migration version number. A single counter shared
	 * across every model (not one per table) -- see OPTION_NEXT_VERSION.
	 *
	 * @return int
	 */
	private static function next_migration_version() {
		$version = (int) get_option( self::OPTION_NEXT_VERSION, 1 );
		update_option( self::OPTION_NEXT_VERSION, $version + 1 );
		return $version;
	}

	/**
	 * Create wp-content/gateway/{models,migrations} if either is missing.
	 * Normally already done by gateway_activate() on plugin activation --
	 * this is a defensive fallback for e.g. a site that had the directory
	 * removed after activation, so a save never fails just because of a
	 * missing folder.
	 */
	private static function ensure_directories() {
		if ( ! is_dir( GATEWAY_MODELS_DIR ) ) {
			wp_mkdir_p( GATEWAY_MODELS_DIR );
		}
		if ( ! is_dir( GATEWAY_MIGRATIONS_DIR ) ) {
			wp_mkdir_p( GATEWAY_MIGRATIONS_DIR );
		}
	}

	/**
	 * Remove whichever of the two files actually got written -- used both
	 * when a write fails partway through and when the migration itself
	 * fails to run, so a broken attempt never leaves a half-created model
	 * behind for the next request's Directory_Loader to pick up.
	 *
	 * @param string $model_path     Path that would have been the model file.
	 * @param string $migration_path Path that would have been the migration file.
	 */
	private static function cleanup_files( $model_path, $migration_path ) {
		if ( file_exists( $model_path ) ) {
			wp_delete_file( $model_path );
		}
		if ( file_exists( $migration_path ) ) {
			wp_delete_file( $migration_path );
		}
	}

	/**
	 * @param string $class_name Model class name.
	 * @param string $table_name Table name.
	 * @return string PHP source for the model file.
	 */
	private static function model_template( $class_name, $table_name ) {
		return <<<PHP
<?php
/**
 * Gateway-generated Eloquent model -- created via the admin app's Models
 * screen. Safe to hand-edit (e.g. add relationships, casts, accessors);
 * only re-generated if this model is deleted and re-created with the same
 * title.
 */

class {$class_name} extends \\Illuminate\\Database\\Eloquent\\Model {

	/**
	 * @var string
	 */
	protected \$table = '{$table_name}';
}

PHP;
	}

	/**
	 * @param string $migration_class Migration class name.
	 * @param string $table_name      Table name.
	 * @param int    $version         Migration version number.
	 * @return string PHP source for the migration file.
	 */
	private static function migration_template( $migration_class, $table_name, $version ) {
		return <<<PHP
<?php
/**
 * Gateway-generated migration -- creates the "{$table_name}" table. Run
 * automatically once, immediately after being generated (see
 * Model_Builder::create()); a future admin screen will be able to re-run
 * it (Migration_Runner::run() is idempotent per \$version) if needed.
 */

class {$migration_class} extends \\Illuminate\\Database\\Migrations\\Migration {

	/**
	 * Identifies this migration to Migration_Runner, which tracks
	 * completed migrations by version number rather than class name.
	 *
	 * @var int
	 */
	public \$version = {$version};

	/**
	 * @return void
	 */
	public function up() {
		Schema::create( '{$table_name}', function ( \\Illuminate\\Database\\Schema\\Blueprint \$table ) {
			\$table->id();
			\$table->timestamps();
		} );
	}

	/**
	 * @return void
	 */
	public function down() {
		Schema::dropIfExists( '{$table_name}' );
	}
}

PHP;
	}
}
