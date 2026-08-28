<?php
/**
 * The configured choice list for a Choice_Field_Type field (Buttons/
 * Select/Radio/Checkbox) -- its own dedicated table (`gateway_field_choices`),
 * one row per choice, rather than a JSON blob squeezed into a column on
 * `gateway_fields` itself: a real `position` column is what actually makes
 * the list orderable (the Field Editor's own choices list is exactly as
 * reorderable as the Field Editor's own fields list -- see Model_Fields'
 * own docblock on why `position` -- not array index alone -- is what's
 * authoritative there too), and it keeps `gateway_fields` itself a plain,
 * flat row per field regardless of how many choices any one of them has.
 *
 * Every one of this class's own writes replaces a field's ENTIRE choice
 * list at once (see set()) rather than adding/editing/removing a single
 * choice in place -- the Field Editor's own choices editor is a single
 * orderable list a site owner edits as a whole and saves once (add a row,
 * remove a row, drag to reorder, then Save), the same "submit the whole
 * new order" shape Model_Fields::reorder() already uses for the fields
 * list itself, just with the list's own *contents* also allowed to change
 * between calls, not just their order.
 *
 * Deliberately not itself concerned with WHICH fields are even Choice_Field_Type
 * fields, or with validating what a raw choice value looks like -- both
 * are Model_Fields' own job (require_choices_for_field()), the same
 * "storage class doesn't validate, its caller does" split Model_Relationships
 * and Model_Fields already keep between each other.
 *
 * @package Gateway
 */

namespace Gateway;

defined( 'ABSPATH' ) || exit;

class Model_Field_Choices {

	/**
	 * Table name (unprefixed) -- see Model_Fields::TABLE's own docblock
	 * for why this really becomes e.g. "wp_gateway_field_choices".
	 */
	const TABLE = 'gateway_field_choices';

	/**
	 * Creates the gateway_field_choices table if it doesn't already exist
	 * -- same "also do it lazily" reasoning as Model_Fields::ensure_table(),
	 * called defensively before every read/write in this class.
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
				// gateway_fields.id -- not a real Eloquent/Capsule foreign
				// key constraint (this plugin's other tables, e.g.
				// gateway_fields itself, don't use real FK constraints
				// either, relying instead on this class's own lifecycle
				// calls -- set()/forget() -- staying in lock-step with
				// Model_Fields' own add()/update()/remove()/forget()).
				$table->unsignedBigInteger( 'field_id' );
				$table->string( 'value' );
				// Sort order -- see this class's own docblock for why a
				// real column, not array index alone, is what's
				// authoritative (same reasoning as Model_Fields::position).
				$table->unsignedInteger( 'position' )->default( 0 );
				$table->timestamps();

				// A field's own choices must each be distinct -- the same
				// belt-and-suspenders role gateway_fields' own
				// unique(model,name) plays alongside Model_Fields::validate()'s
				// own uniqueness check; Model_Fields::require_choices_for_field()
				// is what actually produces the friendly, pre-empted error.
				$table->unique( array( 'field_id', 'value' ) );
				$table->index( 'field_id' );
			}
		);
	}

	/**
	 * @return \Illuminate\Database\Query\Builder
	 */
	private static function table() {
		self::ensure_table();

		return \Illuminate\Database\Capsule\Manager::table( self::TABLE );
	}

	/**
	 * Batch-reads every choice for several fields at once, grouped by
	 * field id -- what Model_Fields::all() uses so listing a model's
	 * fields costs one query total for every field's own choices, not one
	 * query per Choice_Field_Type field on the model.
	 *
	 * @param int[] $field_ids gateway_fields.id values.
	 * @return array<int,string[]> Map of field_id => ordered choice
	 *                               values -- every requested id present
	 *                               (as `[]`) even if it has no choices
	 *                               recorded (or isn't a real field id at
	 *                               all), so a caller can always index it
	 *                               directly without an isset() check.
	 */
	public static function for_fields( array $field_ids ) {
		$field_ids = array_values( array_unique( array_filter( array_map( 'absint', $field_ids ) ) ) );
		$by_field  = array_fill_keys( $field_ids, array() );

		if ( empty( $field_ids ) ) {
			return $by_field;
		}

		foreach (
			self::table()
				->whereIn( 'field_id', $field_ids )
				->orderBy( 'position' )
				->orderBy( 'id' )
				->get( array( 'field_id', 'value' ) )
			as $row
		) {
			$by_field[ (int) $row->field_id ][] = $row->value;
		}

		return $by_field;
	}

	/**
	 * @param int $field_id gateway_fields.id.
	 * @return string[] Ordered choice values for this one field, `[]` if
	 *                    it has none.
	 */
	public static function all( $field_id ) {
		$by_field = self::for_fields( array( $field_id ) );

		return $by_field[ (int) $field_id ] ?? array();
	}

	/**
	 * Replaces a field's entire choice list with $choices, in the given
	 * order -- the only write operation this class has (see this class's
	 * own docblock for why). $choices is trusted here to already be
	 * validated/sanitized (Model_Fields::require_choices_for_field()'s
	 * job, not this class's).
	 *
	 * @param int      $field_id gateway_fields.id.
	 * @param string[] $choices  Ordered, already-sanitized choice values.
	 */
	public static function set( $field_id, array $choices ) {
		self::table()->where( 'field_id', $field_id )->delete();

		if ( empty( $choices ) ) {
			return;
		}

		$now  = current_time( 'mysql' );
		$rows = array();

		foreach ( array_values( $choices ) as $position => $value ) {
			$rows[] = array(
				'field_id'   => $field_id,
				'value'      => $value,
				'position'   => $position,
				'created_at' => $now,
				'updated_at' => $now,
			);
		}

		self::table()->insert( $rows );
	}

	/**
	 * Deletes every choice recorded for one field -- called by
	 * Model_Fields::remove() (a removed field's own choices are
	 * meaningless orphans otherwise) and whenever update() finds a field
	 * has stopped being a Choice_Field_Type at all.
	 *
	 * @param int $field_id gateway_fields.id.
	 */
	public static function forget( $field_id ) {
		self::forget_for_fields( array( $field_id ) );
	}

	/**
	 * Batch counterpart to forget() -- one query for every field id, used
	 * by Model_Fields::forget() when an entire model's fields (and
	 * therefore all of their choices) are being discarded at once (e.g.
	 * Model_Builder::rename() retiring the old class).
	 *
	 * @param int[] $field_ids gateway_fields.id values.
	 */
	public static function forget_for_fields( array $field_ids ) {
		$field_ids = array_values( array_unique( array_filter( array_map( 'absint', $field_ids ) ) ) );

		if ( empty( $field_ids ) ) {
			return;
		}

		self::table()->whereIn( 'field_id', $field_ids )->delete();
	}
}
