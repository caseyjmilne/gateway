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
 * Each choice is a `{value, label}` pair, not a bare string: `value` is
 * what actually gets stored/returned/compared when the field is used --
 * `Choice_Field_Type`'s own `cast()` (Select/Radio/Buttons/Checkbox
 * alike) only ever operates on `value`, never `label` -- while `label` is
 * purely a display concern, read only by the admin app itself (a
 * `<select>`'s visible option text, a checkbox's visible caption, the
 * Records list's own display of an already-saved value). This mirrors
 * `gateway_fields.label`'s own relationship to `gateway_fields.name`
 * elsewhere in this plugin: one column is the real, technical identity
 * something is stored/compared against, the other is an optional,
 * cosmetic override of how it's shown, falling back to the technical one
 * when left blank (see `label`'s own column comment below, and
 * `Model_Fields::require_choices_for_field()`, which is what actually
 * applies that fallback).
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

		if ( ! $schema->hasTable( self::TABLE ) ) {
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
					// Optional, cosmetic override of how this choice is
					// SHOWN -- see this class's own docblock for the full
					// value/label split. Nullable for the same upgrade-path
					// reason as the ALTER below: a row from before this
					// column existed has no real label to backfill, and
					// for_fields()'s own fallback (label defaults to value
					// when blank) already treats that identically to a
					// freshly-added choice that simply never got one typed
					// in either.
					$table->string( 'label' )->nullable();
					// Sort order -- see this class's own docblock for why a
					// real column, not array index alone, is what's
					// authoritative (same reasoning as Model_Fields::position).
					$table->unsignedInteger( 'position' )->default( 0 );
					$table->timestamps();

					// A field's own choices must each be distinct BY VALUE
					// (never by label -- two choices sharing a label but
					// storing different values are perfectly meaningful,
					// the same way two posts can share a title) -- the same
					// belt-and-suspenders role gateway_fields' own
					// unique(model,name) plays alongside Model_Fields::validate()'s
					// own uniqueness check; Model_Fields::require_choices_for_field()
					// is what actually produces the friendly, pre-empted error.
					$table->unique( array( 'field_id', 'value' ) );
					$table->index( 'field_id' );
				}
			);

			return;
		}

		// Upgrade path for a table created by a version of this plugin that
		// predates the label column -- same reasoning/backfill as every
		// column Model_Fields::ensure_table() adds this way for
		// gateway_fields itself: nullable, existing rows get NULL, and
		// for_fields()'s own fallback treats that exactly like a choice
		// that simply never had a label typed in.
		if ( ! $schema->hasColumn( self::TABLE, 'label' ) ) {
			$schema->table(
				self::TABLE,
				function ( \Illuminate\Database\Schema\Blueprint $table ) {
					$table->string( 'label' )->nullable();
				}
			);
		}
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
	 * @return array<int,array{value:string,label:string}[]> Map of
	 *                field_id => ordered choices -- every requested id
	 *                present (as `[]`) even if it has no choices recorded
	 *                (or isn't a real field id at all), so a caller can
	 *                always index it directly without an isset() check. A
	 *                blank/NULL `label` (a row from before that column
	 *                existed, or one whose label was simply left blank)
	 *                comes back defaulted to that row's own `value` --
	 *                see this class's own docblock for why -- so a caller
	 *                never has to fall back to `value` itself.
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
				->get( array( 'field_id', 'value', 'label' ) )
			as $row
		) {
			$by_field[ (int) $row->field_id ][] = array(
				'value' => $row->value,
				'label' => ! empty( $row->label ) ? $row->label : $row->value,
			);
		}

		return $by_field;
	}

	/**
	 * @param int $field_id gateway_fields.id.
	 * @return array{value:string,label:string}[] Ordered choices for this
	 *                one field, `[]` if it has none.
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
	 * job, not this class's) -- specifically, that every one already has
	 * both a non-empty `value` AND a `label` (already defaulted to
	 * `value` there when left blank, never blank/missing by the time it
	 * reaches here).
	 *
	 * @param int                             $field_id gateway_fields.id.
	 * @param array{value:string,label:string}[] $choices Ordered,
	 *                already-sanitized choices.
	 */
	public static function set( $field_id, array $choices ) {
		self::table()->where( 'field_id', $field_id )->delete();

		if ( empty( $choices ) ) {
			return;
		}

		$now  = current_time( 'mysql' );
		$rows = array();

		foreach ( array_values( $choices ) as $position => $choice ) {
			$rows[] = array(
				'field_id'   => $field_id,
				'value'      => $choice['value'],
				'label'      => $choice['label'],
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
