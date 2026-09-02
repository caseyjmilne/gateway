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
 * Title is the single source of truth for naming -- both the class name
 * and the table name (auto-pluralized from it) are derived from it alone.
 * A separate "Plural Title" field also exists (e.g. "Tickets" for a
 * "Ticket" model), but it's a plain display label only -- stored (see
 * OPTION_PLURAL_TITLES) for a future screen to show, never used to
 * derive the table name. An earlier version had it override the table
 * name instead, which was confusing in practice: the table would change
 * out from under a model whose Title never changed, with no obvious
 * reason why from that model's own detail screen.
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
	 * Option name the stored Plural Title labels are kept under -- a plain
	 * class name => plural title text map. A model with no entry here
	 * (never given one, or it was left blank) simply has no Plural Title;
	 * there's no auto-derived fallback.
	 */
	const OPTION_PLURAL_TITLES = 'gateway_model_plural_titles';

	/**
	 * Option name the stored model Type choice is kept under -- a plain
	 * class name => TYPE_* constant map, the same shape as
	 * OPTION_PLURAL_TITLES. A model with no entry here (any model created
	 * before this feature existed) is treated as TYPE_DATA_MODEL by
	 * get_model_type() -- the "blank except for id/timestamps" shape
	 * every model already had before there was a choice to make at all,
	 * so nothing already on a site silently starts behaving as a Content
	 * Type it never asked to be.
	 */
	const OPTION_MODEL_TYPES = 'gateway_model_types';

	/**
	 * A blank model -- the "id + timestamps only, add whatever fields you
	 * want" shape every model had before Type existed as a choice at all.
	 * The right choice for a model that isn't really a piece of content
	 * with its own URL (a join/lookup table, a settings-like singleton,
	 * anything with no natural "one visitor-facing page per record"
	 * shape).
	 */
	const TYPE_DATA_MODEL = 'data_model';

	/**
	 * A model pre-seeded with a `title` (Text, Required) field and a
	 * `permalink` (Permalink) field tracking it in Auto mode
	 * (`settings.source_field => 'title'`) -- the two things this
	 * plugin's own single-page permalink support (see Permalink_Field_Type/
	 * Permalink_Routes) needs before a record can have its own real URL
	 * at all, added automatically rather than left for a site owner to
	 * notice and add by hand every single time. **Title is Required by
	 * default, per a direct request** ("when we make content type, title
	 * must be set to required by default because we need the permalinks
	 * made"): a blank Title on a record leaves Auto-mode slug computation
	 * with nothing to slugify at all, so a Content Type record could
	 * otherwise be saved with no real permalink ever computed for it --
	 * defeating the entire point of seeding this field in the first
	 * place. Required, not merely encouraged, exactly the way this class
	 * already treats "does this kind of model want a title and a slug at
	 * all" as a decision Type answers once and for all up front, not
	 * something left to chance per record. Still freely editable
	 * afterward like any other field -- a site owner can switch it back
	 * to optional if they genuinely want to (see the Field Editor's own
	 * Validation tab), the same "seeded, never locked" treatment every
	 * other property of these two starter fields already has.
	 * Root/Template Page (the rest of what a working single page
	 * actually needs -- see PermalinkEditor.jsx) are deliberately NOT set
	 * here: those are genuinely per-site choices (what URL prefix, which
	 * template page) this class has no sensible default for, unlike
	 * "does this kind of model want a title and a slug at all," which
	 * Type answers once and for all up front.
	 */
	const TYPE_CONTENT_TYPE = 'content_type';

	/**
	 * Create a model: derive its class/table name from $title alone
	 * (Plural Title, if given, never affects either -- see this class's
	 * own docblock), write the model + migration files, load and register
	 * both classes, and run the migration -- the table exists by the time
	 * this returns successfully. $type is recorded once here and never
	 * changeable afterward -- see get_model_type()'s own docblock for why.
	 *
	 * @param string $title        Free-text title, e.g. "Blog Post".
	 * @param string $plural_title Optional free-text plural label, e.g.
	 *                              "Blog Posts" -- stored for display,
	 *                              never used for naming.
	 * @param string $type         One of the TYPE_* constants -- defaults
	 *                              to TYPE_DATA_MODEL (the original,
	 *                              only-ever-blank behavior) for any
	 *                              caller that doesn't pass one explicitly.
	 * @return array{class:string,table:string,migration_class:string,migration_version:int,plural_title:string,type:string,warnings?:string[]}|\WP_Error
	 */
	public static function create( $title, $plural_title = '', $type = self::TYPE_DATA_MODEL ) {
		$title = trim( (string) $title );

		if ( '' === $title ) {
			return new \WP_Error(
				'gateway_model_title_required',
				__( 'Please enter a title.', 'gateway' ),
				array( 'status' => 400 )
			);
		}

		if ( ! in_array( $type, array( self::TYPE_DATA_MODEL, self::TYPE_CONTENT_TYPE ), true ) ) {
			return new \WP_Error(
				'gateway_model_invalid_type',
				__( 'Type must be either "Content Type" or "Data Model".', 'gateway' ),
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

		$table_name      = self::table_name_for_class( $class_name );
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
			// Reachable even with a class name that's otherwise free: two
			// different titles can still auto-pluralize to the same table
			// (e.g. an irregular plural coinciding with another word) --
			// rare, but worth its own message rather than a generic
			// "already exists" that would point at the wrong field.
			return new \WP_Error(
				'gateway_model_table_exists',
				sprintf(
					/* translators: %s: table name */
					__( 'A model already uses the table "%s".', 'gateway' ),
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

		$written_model     = false === file_put_contents( $model_path, self::model_template( $class_name, $table_name, array(), array() ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- freshly created, no fields/relationships yet
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

		self::set_plural_title( $class_name, $plural_title );
		self::set_model_type( $class_name, $type );

		$warnings = array();

		// A Content Type's own two defining fields -- see TYPE_CONTENT_TYPE's
		// own docblock for why these two specifically (Title Required by
		// default included), and why Root/Template Page are deliberately
		// left for the site owner to set afterward instead. Added via the
		// exact same Model_Fields::add() a site owner would use by hand --
		// real ADD COLUMN migrations, not something baked into
		// model_template()/migration_template() above, so a Content
		// Type's fields show up in the Field Editor exactly like any
		// other field, freely editable (label, Character Limit, even
		// Required itself, etc.) from that point on -- only Type itself,
		// not what it seeded, is fixed forever.
		if ( self::TYPE_CONTENT_TYPE === $type ) {
			$title_field = Model_Fields::add( $class_name, 'title', 'text', __( 'Title', 'gateway' ), null, null, true );

			if ( is_wp_error( $title_field ) ) {
				// The model/table already exist and are perfectly usable
				// either way -- a failure seeding these two starter fields
				// is reported, not fatal to the model as a whole, the same
				// "non-fatal, surfaced as a warning" treatment
				// rewrite_model_file() failures already get elsewhere in
				// this class.
				$warnings[] = sprintf(
					/* translators: %s: error message */
					__( 'Could not add the default Title field: %s', 'gateway' ),
					$title_field->get_error_message()
				);
			} else {
				$permalink_field = Model_Fields::add(
					$class_name,
					'permalink',
					'permalink',
					__( 'Permalink', 'gateway' ),
					null,
					null,
					false,
					array( 'source_field' => 'title' )
				);

				if ( is_wp_error( $permalink_field ) ) {
					$warnings[] = sprintf(
						/* translators: %s: error message */
						__( 'Could not add the default Permalink field: %s', 'gateway' ),
						$permalink_field->get_error_message()
					);
				}
			}
		}

		$result = array(
			'class'              => $class_name,
			'table'              => $table_name,
			'migration_class'    => $migration_class,
			'migration_version'  => $version,
			'plural_title'       => self::get_plural_title( $class_name ),
			'type'               => $type,
		);

		if ( $warnings ) {
			$result['warnings'] = $warnings;
		}

		return $result;
	}

	/**
	 * Rename a model: derive the new class/table from $title exactly like
	 * create() does, generate the new model/migration/table, and only
	 * once that has actually succeeded, retire the old one -- drop its
	 * table (via its own migration's down()), delete its files, and
	 * unregister both its classes. That ordering is deliberate: if
	 * anything about the new model fails, the old one is untouched rather
	 * than this leaving neither the old model nor a working new one behind.
	 *
	 * Since naming depends only on $title (see this class's own
	 * docblock), a $plural_title-only change never reaches any of that --
	 * it's just a stored label update, no table/files/registration
	 * touched at all. Title unchanged (e.g. just a whitespace/case
	 * difference that sanitizes identically) is the only case treated
	 * this way; anything that changes $title goes through the full
	 * create-then-retire path below even if $plural_title also changed.
	 *
	 * Type is carried over from $old_class unchanged -- there's no
	 * parameter for it here at all, matching get_model_type()'s own
	 * "fixed forever, not just fixed until a rename" contract. A renamed
	 * Content Type is still a Content Type afterward (with a fresh
	 * `title`/`permalink` pair on the new table, the same "starts fresh
	 * on fields" trade-off every other field already has across a
	 * rename -- see the old field rows being forgotten, below).
	 *
	 * @param string $old_class    Existing, registered model class name.
	 * @param string $title        New free-text title.
	 * @param string $plural_title New free-text plural label -- see
	 *                              create()'s own docblock.
	 * @return array{class:string,table:string,migration_class:string,migration_version:int,plural_title:string,type:string,warnings?:string[]}|\WP_Error
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

		// Title unchanged -- naming is untouched either way, so this is
		// never destructive: just update the stored Plural Title label
		// (blank clears it) and report the model as-is. No files,
		// migration, or table are touched.
		if ( $new_class_name === $old_class ) {
			self::set_plural_title( $old_class, $plural_title );

			$old_instance         = new $old_class();
			$old_table            = $old_instance->getTable();
			$old_migration_class  = self::migration_class_for_table( $old_table );

			return array(
				'class'             => $old_class,
				'table'             => $old_table,
				'migration_class'   => $old_migration_class,
				'migration_version' => self::registered_migration_version( $old_migration_class ),
				'plural_title'      => self::get_plural_title( $old_class ),
				'type'              => self::get_model_type( $old_class ),
			);
		}

		if ( class_exists( $new_class_name, false ) ) {
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

		if ( ! Database_Connection::is_healthy() ) {
			return new \WP_Error(
				'gateway_database_unavailable',
				__( 'The database connection isn\'t currently working -- check the Database Connection screen before renaming a model.', 'gateway' ),
				array( 'status' => 503 )
			);
		}

		$old_instance = new $old_class();
		$old_table    = $old_instance->getTable();
		$old_type     = self::get_model_type( $old_class );

		// Create the new model/migration/table first -- see this method's
		// own docblock for why the old one is only touched after this
		// succeeds. $old_type carried through unchanged -- see this
		// method's own docblock for why there's no way to change it here.
		$created = self::create( $title, $plural_title, $old_type );

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
		self::forget_plural_title( $old_class );
		self::forget_model_type( $old_class );
		// The old table (and every field's own column on it) is already
		// gone by this point -- the old field *rows* in gateway_fields
		// aren't carried over to the new model either, so a renamed model
		// starts fresh on fields, the same "old data is lost" trade-off
		// already accepted for the table itself. A future version could
		// replay each field onto the new table instead; not done here to
		// avoid a rename silently generating a whole cascade of
		// additional field migrations on its own.
		Model_Fields::forget( $old_class );
		// Same reasoning, for relationships -- see Model_Relationships::
		// forget()'s own docblock for the one thing this doesn't cover
		// (another model's relationship still pointing at $old_class).
		Model_Relationships::forget( $old_class );
		// Same reasoning again, for the Records-table Columns config --
		// see Model_Columns::forget()'s own docblock.
		Model_Columns::forget( $old_class );

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
			// Merged, not overwritten -- create() above may already have
			// set its own 'warnings' (e.g. a Content Type's default fields
			// failing to seed); this rename's own warnings (the old
			// table's own rollback failing) are additional, never a
			// replacement for those.
			$created['warnings'] = array_merge( $created['warnings'] ?? array(), $warnings );
		}

		return $created;
	}

	/**
	 * @param string $class_name Model class name.
	 * @return string The stored Plural Title label, or '' if none is set.
	 */
	public static function get_plural_title( $class_name ) {
		$titles = get_option( self::OPTION_PLURAL_TITLES, array() );

		return isset( $titles[ $class_name ] ) ? $titles[ $class_name ] : '';
	}

	/**
	 * @param string $class_name   Model class name.
	 * @param string $plural_title Label text; blank clears any existing one.
	 */
	private static function set_plural_title( $class_name, $plural_title ) {
		$plural_title = sanitize_text_field( trim( (string) $plural_title ) );

		if ( '' === $plural_title ) {
			self::forget_plural_title( $class_name );
			return;
		}

		$titles                = get_option( self::OPTION_PLURAL_TITLES, array() );
		$titles[ $class_name ] = $plural_title;
		update_option( self::OPTION_PLURAL_TITLES, $titles );
	}

	/**
	 * @param string $class_name Model class name.
	 */
	private static function forget_plural_title( $class_name ) {
		$titles = get_option( self::OPTION_PLURAL_TITLES, array() );

		if ( isset( $titles[ $class_name ] ) ) {
			unset( $titles[ $class_name ] );
			update_option( self::OPTION_PLURAL_TITLES, $titles );
		}
	}

	/**
	 * A model's Type, chosen once at create() time and never changeable
	 * afterward -- the admin app shows this as a plain, static label on
	 * an existing model's own General tab (never a dropdown there the way
	 * it is on the Create Model form), the same "immutable once created"
	 * treatment a Relate to One/Relate to Many field's own relationship
	 * already gets in Model_Fields::update(). There's no real migration
	 * path for switching a model between the two after the fact --
	 * Content Type -> Data Model would leave an orphaned `title`/
	 * `permalink` pair a site owner would have to notice and remove by
	 * hand anyway (removing them outright would be needlessly
	 * destructive if any of that data mattered), and Data Model ->
	 * Content Type has no way to know WHICH of the model's existing
	 * fields (if any) should suddenly become "the" title. Fixed at
	 * creation sidesteps needing an answer to either.
	 *
	 * @param string $class_name Model class name.
	 * @return string One of the TYPE_* constants -- TYPE_DATA_MODEL for
	 *                 any model with no stored entry at all (every model
	 *                 created before this feature existed).
	 */
	public static function get_model_type( $class_name ) {
		$types = get_option( self::OPTION_MODEL_TYPES, array() );

		return isset( $types[ $class_name ] ) ? $types[ $class_name ] : self::TYPE_DATA_MODEL;
	}

	/**
	 * @param string $class_name Model class name.
	 * @param string $type       One of the TYPE_* constants.
	 */
	private static function set_model_type( $class_name, $type ) {
		$types                = get_option( self::OPTION_MODEL_TYPES, array() );
		$types[ $class_name ] = $type;
		update_option( self::OPTION_MODEL_TYPES, $types );
	}

	/**
	 * @param string $class_name Model class name.
	 */
	private static function forget_model_type( $class_name ) {
		$types = get_option( self::OPTION_MODEL_TYPES, array() );

		if ( isset( $types[ $class_name ] ) ) {
			unset( $types[ $class_name ] );
			update_option( self::OPTION_MODEL_TYPES, $types );
		}
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
		// Strip anything that isn't a letter, digit, space, hyphen, or
		// underscore before studly-casing -- Str::studly() only treats
		// those last three as word separators, so stray punctuation would
		// otherwise survive straight into the class name (e.g. "Foo!"
		// would studly-case to "Foo!", not a valid PHP identifier).
		$clean = preg_replace( '/[^A-Za-z0-9 _-]+/', '', $title );

		return \Illuminate\Support\Str::studly( $clean );
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
	 * The generic counterpart to migration_filename() above, for any
	 * migration that isn't a table-creation one -- e.g. Model_Fields'
	 * own add/rename/change/drop-column migrations, which don't share
	 * create()'s fixed "create_X_table" shape.
	 *
	 * @param int    $version         Migration version number.
	 * @param string $migration_class Migration class name.
	 * @return string e.g. "000007_addfirstnametoticketstablev7.php".
	 */
	public static function migration_filename_for_class( $version, $migration_class ) {
		return sprintf( '%06d_%s.php', $version, \Illuminate\Support\Str::snake( $migration_class ) );
	}

	/**
	 * Claim the next migration version number. A single counter shared
	 * across every model (not one per table) -- see OPTION_NEXT_VERSION.
	 *
	 * @return int
	 */
	public static function next_migration_version() {
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
	public static function ensure_directories() {
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
	 * (Re)writes a model's own PHP file using the current template, baking
	 * in $fields as a literal array -- called by Model_Fields after every
	 * successful add()/update()/remove(), so getFields() always contains
	 * the model's actual, current field list printed directly into the
	 * file (see model_template()/fields_literal()) rather than a live
	 * reference back into Model_Fields. This also "heals" a model created
	 * before some later addition to model_template() (getFields()/
	 * getFillable(), when those were introduced, is the motivating
	 * example -- a model created earlier had neither, so Eloquent fell
	 * back to its own empty default $fillable and rejected every field as
	 * unfillable) the next time any field on it actually changes, rather
	 * than staying stuck on whatever template existed when it was first
	 * created.
	 *
	 * Overwrites the file unconditionally, same trade-off retable()
	 * already accepts for its own model-file rewrite: a hand-edited model
	 * file is only safe from this while nothing about its fields changes.
	 *
	 * @param string $class_name    Model class name.
	 * @param string $table_name    Table name.
	 * @param array  $fields        The model's current flat field array --
	 *                                printed into the file as a literal,
	 *                                not referenced.
	 * @param array  $relationships The model's current flat relationship
	 *                                array (see Model_Relationships) --
	 *                                printed into the file as literal
	 *                                relationship methods. Required, not
	 *                                defaulted to an empty array: the file
	 *                                is regenerated in full on every call,
	 *                                from whichever of Model_Fields/
	 *                                Model_Relationships triggered it, so
	 *                                a caller that forgot this would
	 *                                silently wipe out every relationship
	 *                                the model already has.
	 * @return true|\WP_Error
	 */
	public static function rewrite_model_file( $class_name, $table_name, array $fields, array $relationships ) {
		$model_path = trailingslashit( GATEWAY_MODELS_DIR ) . $class_name . '.php';

		if ( false === file_put_contents( $model_path, self::model_template( $class_name, $table_name, $fields, $relationships ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			return new \WP_Error(
				'gateway_model_write_failed',
				__( 'Could not update the model file -- check that wp-content/gateway is writable.', 'gateway' ),
				array( 'status' => 500 )
			);
		}

		return true;
	}

	/**
	 * @param string $class_name    Model class name.
	 * @param string $table_name    Table name.
	 * @param array  $fields        The model's current flat field array
	 *                                (see Model_Fields) -- printed into
	 *                                the file as a literal PHP array, via
	 *                                fields_literal().
	 * @param array  $relationships The model's current flat relationship
	 *                                array (see Model_Relationships) --
	 *                                printed into the file as one real
	 *                                method per relationship, via
	 *                                relationships_block().
	 * @return string PHP source for the model file.
	 */
	private static function model_template( $class_name, $table_name, array $fields = array(), array $relationships = array() ) {
		$fields_literal      = self::fields_literal( $fields );
		$casts_literal       = self::casts_literal( $fields );
		$relationships_block = self::relationships_block( $relationships );

		return <<<PHP
<?php
/**
 * Gateway-generated Eloquent model -- created via the admin app's Models
 * screen. Safe to hand-edit (e.g. add accessors, a relationship of your
 * own); regenerated (getFields()/getFillable()/\$casts/every relationship
 * method included) every time a field or relationship is added, edited,
 * removed, or reordered via the admin app's Field/Relationship Editors --
 * see Gateway\\Model_Fields/Gateway\\Model_Relationships.
 */

class {$class_name} extends \\Illuminate\\Database\\Eloquent\\Model {

	/**
	 * @var string
	 */
	protected \$table = '{$table_name}';

	/**
	 * One entry per field whose own type needs Eloquent to actually do
	 * something with its raw stored value beyond handing it back as-is --
	 * see Gateway\\Field_Type::eloquent_cast(). Empty for a model with no
	 * such field, same as getFields() below is `array()` for one with no
	 * fields at all.
	 *
	 * @var array<string,string>
	 */
	protected \$casts = {$casts_literal};

	/**
	 * Field definitions managed via the admin app's Field Editor -- see
	 * Gateway\\Model_Fields, which also generates and runs the migration
	 * for each field's own real column. Printed here as a literal array
	 * (not a reference back into Model_Fields) every time a field is
	 * added, edited, removed, or reordered, so this is always the actual,
	 * current, inspectable list, in the same order the Field Editor's own
	 * sortable list has them in. A flat array of field arrays (never
	 * separated into parallel {names: [...], types: [...]} arrays) -- two
	 * fields simply sit as neighbors in the same array. `label` is a
	 * display string only -- it never affects the real column; `position`
	 * is what determined this array's own order, kept here only for
	 * reference (the order itself is what actually matters).
	 *
	 * @return array<int,array{name:string,label:string,type:string,position:int}>
	 */
	public static function getFields() {
		return {$fields_literal};
	}

	/**
	 * Overrides Eloquent's own getFillable() (rather than declaring
	 * \$fillable directly) so mass-assignment always reflects whatever
	 * fields currently exist, without ever needing a separate edit of
	 * its own just because a field was added, edited, or removed.
	 *
	 * @return string[]
	 */
	public function getFillable() {
		return array_column( static::getFields(), 'name' );
	}
{$relationships_block}}

PHP;
	}

	/**
	 * Renders a flat field array as PHP source -- e.g.
	 * "array(\n\t\t\tarray( 'name' => 'title', 'label' => 'Title', 'type'
	 * => 'text', 'position' => 0 ),\n\t\t)" -- for printing directly into
	 * getFields()'s own return statement in model_template(). The array's
	 * own element order (not the 'position' value printed alongside each
	 * one) is what getFields() -- and everything reading it -- actually
	 * treats as the order; $fields is expected to already be sorted
	 * (Model_Fields::all() always returns it that way). Each name/label/
	 * type goes through var_export() so a value containing a quote or
	 * backslash still produces valid, safely-escaped PHP source.
	 *
	 * @param array $fields Flat array of {name, label, type, position}
	 *                       field arrays, already in display order.
	 * @return string PHP source for the array literal (no trailing
	 *                 semicolon -- the caller's own "return ...;" adds it).
	 */
	private static function fields_literal( array $fields ) {
		if ( empty( $fields ) ) {
			return 'array()';
		}

		$lines = array();

		foreach ( $fields as $field ) {
			$lines[] = "\t\t\tarray( 'name' => " . var_export( $field['name'], true ) . ", 'label' => " . var_export( $field['label'], true ) . ", 'type' => " . var_export( $field['type'], true ) . ", 'position' => " . var_export( $field['position'], true ) . ' ),';
		}

		return "array(\n" . implode( "\n", $lines ) . "\n\t\t)";
	}

	/**
	 * Renders the `protected $casts = ...;` array literal for
	 * model_template() -- one `'field_name' => 'cast_name'` entry for
	 * every field whose own type declares a non-null Field_Type::
	 * eloquent_cast() (e.g. Checkbox_Field_Type's "array",
	 * True_False_Field_Type's "boolean"), skipping every field whose type
	 * doesn't need one (returns `null`) or that isn't a currently
	 * registered type at all (the same "degrade rather than fatal error"
	 * tolerance get_related_columns_for_collection() etc. already extend
	 * to an unregistered/removed type).
	 *
	 * @param array $fields Flat array of field arrays (see fields_literal()).
	 * @return string PHP source for the array literal (no trailing
	 *                 semicolon -- the caller's own property declaration
	 *                 adds it).
	 */
	private static function casts_literal( array $fields ) {
		$lines = array();

		foreach ( $fields as $field ) {
			$type_class = Field_Type_Registry::get( $field['type'] );

			if ( ! $type_class || ! class_exists( $type_class ) ) {
				continue;
			}

			$cast = $type_class::eloquent_cast();

			if ( null === $cast ) {
				continue;
			}

			$lines[] = "\t\t" . var_export( $field['name'], true ) . ' => ' . var_export( $cast, true ) . ',';
		}

		if ( empty( $lines ) ) {
			return 'array()';
		}

		return "array(\n" . implode( "\n", $lines ) . "\n\t)";
	}

	/**
	 * Renders every relationship as a real PHP method, one per
	 * relationship, for printing directly into the class body in
	 * model_template() (right after getFillable(), before the class's
	 * own closing brace). Unlike fields_literal() (one array literal),
	 * each relationship becomes actual, callable code -- exactly what
	 * makes it a relationship Eloquent can use at all, not just metadata
	 * describing one.
	 *
	 * @param array $relationships Flat array of {related_model, type,
	 *                              method_name} relationship arrays (see
	 *                              Model_Relationships).
	 * @return string PHP source for every relationship method,
	 *                 concatenated -- '' if there are none, so the
	 *                 template's own `{$relationships_block}}` collapses
	 *                 back to a plain closing brace right after
	 *                 getFillable() with nothing in between.
	 */
	private static function relationships_block( array $relationships ) {
		if ( empty( $relationships ) ) {
			return '';
		}

		// No separator -- each method's own heredoc already carries a
		// leading blank line (and the last one, a trailing one right
		// before the class's own closing brace); joining with another
		// "\n" on top would double up the blank line between methods.
		return implode( '', array_map( array( __CLASS__, 'relationship_method' ), $relationships ) );
	}

	/**
	 * @param array $relationship {related_model, type, method_name}.
	 * @return string PHP source for one relationship method, e.g.:
	 *                 "\n\t/**\n\t * ...\n\t *\/\n\tpublic function
	 *                 model() {\n\t\treturn \$this->belongsTo(
	 *                 \Model::class );\n\t}\n" -- leading/trailing
	 *                 newlines are what give it its own blank line above
	 *                 and below once concatenated with its neighbors in
	 *                 relationships_block().
	 */
	private static function relationship_method( array $relationship ) {
		$method_name   = $relationship['method_name'];
		$type          = $relationship['type'];
		$related_class = $relationship['related_model'];
		// Every one of Model_Relationships::TYPES' own keys (hasOne,
		// hasMany, belongsTo, belongsToMany) already matches its real
		// Illuminate\Database\Eloquent\Relations class name exactly, one
		// ucfirst() away -- no separate mapping needed.
		$return_type = 'Illuminate\\Database\\Eloquent\\Relations\\' . ucfirst( $type );

		// belongsToMany's own pivot table always has created_at/updated_at
		// columns (Model_Relationships::ensure_pivot_table() creates them
		// unconditionally) -- but Eloquent only ever populates them on
		// attach()/sync() if the relationship itself opts in via
		// withTimestamps(); without this, every pivot row silently gets
		// NULL for both, real columns nothing ever fills in. hasOne/
		// hasMany/belongsTo need no such call -- they're plain columns on
		// a real model's own table, already covered by that model's usual
		// Eloquent timestamp behavior on create()/save().
		$call = 'belongsToMany' === $type
			? "\$this->{$type}( \\{$related_class}::class )->withTimestamps()"
			: "\$this->{$type}( \\{$related_class}::class )";

		return <<<PHP

	/**
	 * Relationship added via the admin app's Relationship Editor -- see
	 * Gateway\\Model_Relationships.
	 *
	 * @return \\{$return_type}
	 */
	public function {$method_name}() {
		return {$call};
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
