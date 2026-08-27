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
 * Unlike a field, a relationship never touches the schema at all -- no
 * migration, ever. It's pure metadata: which Eloquent relationship
 * method (hasOne/hasMany/belongsTo/belongsToMany -- see TYPES) a model
 * gets, pointing at which other model. add()/remove() here are
 * accordingly simpler than their Model_Fields counterparts: write the
 * row, rewrite the file, done.
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

		$found = false;

		foreach ( self::all( $class_name ) as $existing ) {
			if ( $existing['method_name'] === $method_name ) {
				$found = true;
				break;
			}
		}

		if ( ! $found ) {
			return new \WP_Error(
				'gateway_relationship_not_found',
				__( 'Relationship not found.', 'gateway' ),
				array( 'status' => 404 )
			);
		}

		if ( ! Database_Connection::is_healthy() ) {
			return self::unavailable_error();
		}

		self::table()
			->where( 'model', $class_name )
			->where( 'method_name', $method_name )
			->delete();

		// Not surfaced as a warning here (same reasoning as
		// Model_Fields::remove()) -- removing the relationship succeeded
		// regardless.
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
