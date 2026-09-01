<?php
/**
 * A model's own "which columns show in its Records table, and which of
 * those are sortable" configuration -- the new **Columns** tab on
 * `ModelDetail`, beside Permalinks. The problem this solves: `RecordsCrud.jsx`
 * used to render every single one of a model's own fields as a table
 * column unconditionally, which gets cluttered fast on a model with a
 * lot of fields.
 *
 * Structurally the smallest member of the Model_Fields/Model_Relationships
 * family: ONE row per model (`gateway_table_columns`, `model` unique),
 * not one row per column. An ordered LIST of `{key, sortable}` pairs is
 * exactly what a single JSON column already models well -- the same
 * shape `gateway/datatable`'s own `columns` block attribute already uses
 * for its front-end column picker (`ColumnConfigTable`/`ColumnsPanel`;
 * this feature's own admin-app UI deliberately mirrors that same
 * picker-plus-config-table shape) -- so there's no per-row structure
 * here worth a normalized table the way `gateway_relationships` needs.
 *
 * **Unconfigured** (no row at all -- every model starts this way) means
 * exactly today's PRE-EXISTING behavior: every one of the model's own
 * fields shows, in their own Fields-tab order, none of them sortable.
 * `get()` returns `null` in that case rather than a default array, so
 * every caller (`Model_REST_Controller::describe_model()`, `Records_REST_
 * Controller::list_records()`, `RecordsCrud.jsx`) can tell "never
 * configured" apart from "configured to show every current field" --
 * genuinely different states: the latter is still an explicit choice
 * that does NOT automatically start showing a field added to the model
 * later (see `set()`'s own docblock) the way "unconfigured" always does.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Columns {

	/**
	 * Table name (unprefixed -- Capsule's own connection config already
	 * applies $wpdb->prefix, same as gateway_fields/gateway_relationships).
	 */
	const TABLE = 'gateway_table_columns';

	/**
	 * Creates the gateway_table_columns table if it doesn't already
	 * exist -- same "also called defensively before every read/write"
	 * trade-off Model_Fields::ensure_table()/Model_Relationships::
	 * ensure_table() already accept, on top of gateway_activate()'s own
	 * call.
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
				$table->string( 'model' )->unique(); // Owning model class, e.g. "Ticket".
				$table->text( 'columns' );            // JSON: [{key, sortable}, ...], in display order.
				$table->timestamps();
			}
		);
	}

	/**
	 * @return \Illuminate\Database\Query\Builder Query builder for the
	 *              gateway_table_columns table.
	 */
	private static function table() {
		self::ensure_table();

		return \Illuminate\Database\Capsule\Manager::table( self::TABLE );
	}

	/**
	 * @param string $class_name Model class name.
	 * @return array<int,array{key:string,sortable:bool}>|null Null if this
	 *              model has never had Columns configured at all (see this
	 *              class's own docblock for what that means to callers).
	 */
	public static function get( $class_name ) {
		$row = self::table()->where( 'model', $class_name )->first();

		if ( ! $row ) {
			return null;
		}

		$decoded = json_decode( (string) $row->columns, true );

		return is_array( $decoded ) ? $decoded : null;
	}

	/**
	 * Replaces a model's ENTIRE Columns configuration -- like Model_Fields::
	 * update()'s own `$settings` replace-wholesale behavior, not a merge:
	 * a field left out of `$columns` is simply hidden from the table, it
	 * doesn't stay shown from some earlier save. This is also why
	 * "configured" is a real, distinct choice from "unconfigured" (see
	 * this class's own docblock) -- a model explicitly configured to show
	 * every CURRENT field does not automatically pick up a field added
	 * to the model afterward; a site owner returns to this tab and adds
	 * it, the same way `gateway/datatable`'s own column picker doesn't
	 * retroactively add a newly-created field to an already-published
	 * block either.
	 *
	 * Every entry's own `key` must name one of `$class_name`'s OWN
	 * CURRENT fields (`Model_Fields::all()`) -- a stale key (the field
	 * was since renamed or removed) is silently dropped rather than
	 * rejecting the whole save, the same "never let stale config corrupt
	 * a save" leniency this plugin's admin-app forms already rely on
	 * client-side, re-enforced here server-side too. Duplicate keys
	 * collapse to their FIRST occurrence. Order is preserved exactly as
	 * given -- that's the whole point of an ordered list rather than a
	 * bare set.
	 *
	 * `sortable` is forced `false`, regardless of what was submitted, for
	 * any field whose own type has no real column to sort BY at all
	 * (`Field_Type::blueprint_method() === ''` -- currently only Relate
	 * to Many, backed by a pivot table rather than a column on this
	 * model's own table; see that method's own docblock) -- the same
	 * belt-and-suspenders re-validation `Records_REST_Controller::
	 * list_records()` also independently applies before ever actually
	 * running an ORDER BY against one.
	 *
	 * @param string $class_name Model class name.
	 * @param array  $columns    Raw, client-submitted [{key, sortable}, ...].
	 * @return array<int,array{key:string,sortable:bool}> The actually-saved, sanitized list.
	 */
	public static function set( $class_name, array $columns ) {
		$fields_by_name = array();

		foreach ( Model_Fields::all( $class_name ) as $field ) {
			$fields_by_name[ $field['name'] ] = $field;
		}

		$seen      = array();
		$sanitized = array();

		foreach ( $columns as $column ) {
			$key = is_array( $column ) && isset( $column['key'] ) ? (string) $column['key'] : '';

			if ( '' === $key || ! isset( $fields_by_name[ $key ] ) || isset( $seen[ $key ] ) ) {
				continue;
			}

			$seen[ $key ] = true;

			$type_class    = Field_Type_Registry::get( $fields_by_name[ $key ]['type'] );
			$has_own_column = $type_class && '' !== $type_class::blueprint_method();

			$sanitized[] = array(
				'key'      => $key,
				'sortable' => $has_own_column && ! empty( $column['sortable'] ),
			);
		}

		$now = current_time( 'mysql' );

		if ( self::table()->where( 'model', $class_name )->exists() ) {
			self::table()->where( 'model', $class_name )->update(
				array(
					'columns'    => wp_json_encode( $sanitized ),
					'updated_at' => $now,
				)
			);
		} else {
			self::table()->insert(
				array(
					'model'      => $class_name,
					'columns'    => wp_json_encode( $sanitized ),
					'created_at' => $now,
					'updated_at' => $now,
				)
			);
		}

		return $sanitized;
	}

	/**
	 * Deletes a model's Columns configuration outright -- called only by
	 * Model_Builder::rename() (a rename is really "create a fresh model,
	 * drop the old one" -- see that method's own docblock), the exact
	 * same "forget" treatment Model_Fields::forget()/Model_Relationships::
	 * forget() already get for the identical reason: a renamed model's
	 * old field ROWS are never carried over to the new class name either,
	 * so config keyed to specific field names has nothing meaningful left
	 * to apply to.
	 *
	 * @param string $class_name Model class name.
	 */
	public static function forget( $class_name ) {
		self::table()->where( 'model', $class_name )->delete();
	}
}
