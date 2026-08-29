/**
 * A small rule-builder editor for a field's own Conditional Logic --
 * OR'd groups of AND'd `{field, operator, value}` rules, controlling
 * whether `RecordForm` shows this field at all based on some OTHER
 * field's own current value. Mirrors `ChoicesEditor.jsx`'s own shape --
 * a controlled `value`/`onChange` pair the caller (`FieldEditor`) wires
 * in via a single `<Controller name="conditional_logic.groups" ...>`,
 * this component holding no state of its own -- rather than
 * `react-hook-form`'s own `useFieldArray` (which would need one nested
 * instance per group for a tree this shape), since a plain "rebuild the
 * whole array, call onChange" mutation is simpler here and consistent
 * with how this app already treats every other orderable/editable list.
 *
 * `groups` is `Gateway\\Model_Fields::sanitize_conditional_logic()`'s own
 * `groups` shape: `[{ rules: [{ field, operator, value }, ...] }, ...]`.
 * A blank/incomplete rule (no field picked yet, `field: ''`) is tolerated
 * here while editing -- the server is what actually drops one on save,
 * the same "server validates, this is just the editing surface" split
 * `ChoicesEditor` already has for a blank choice. This is also why
 * `blankRule()` seeds a genuinely BLANK `field` (`''`, matched by its own
 * "-- Select a field --" placeholder `<option>` below) rather than
 * defaulting to `otherFields[0]`'s own name: switching Conditional Logic
 * on seeds one of these immediately (see `FieldEditor`'s own docblock),
 * and a rule that silently pre-picks some field the site owner never
 * actually chose isn't "no rule yet" at all -- it's a real, active
 * "Value is equal to \"\"" condition against whatever the model's first
 * other field happens to be, which matches an empty value on a brand new
 * record but very likely NOT a real value already saved on an existing
 * one, hiding the field on Edit while it stays visible on Add New with
 * no rule ever having been deliberately configured. `RecordForm`'s own
 * `comparableValueFor()`/`ruleMatches()` already treat a rule naming no
 * field (`field: ''`, matching nothing in `fields`) as vacuously true --
 * this is the other half of that: making sure a genuinely not-yet-configured
 * rule actually LOOKS like `''` to begin with, not like a real field's
 * name the user never picked.
 *
 * `otherFields` is every OTHER field on this model (`{name, label}`,
 * excluding whichever field is currently being edited -- a field can
 * never meaningfully condition on its own value) -- the same list the
 * server's own `sanitize_conditional_logic()` validates a rule's `field`
 * against, so nothing this editor could ever produce gets silently
 * dropped on save.
 */

const OPERATORS = [
	{ key: 'has_any_value', label: 'Has any value', needsValue: false },
	{ key: 'has_no_value', label: 'Has no value', needsValue: false },
	{ key: 'value_equals', label: 'Value is equal to', needsValue: true },
	{ key: 'value_not_equals', label: 'Value is not equal to', needsValue: true },
	{ key: 'value_contains', label: 'Value contains', needsValue: true },
];

const blankRule = () => ( {
	field: '',
	operator: 'value_equals',
	value: '',
} );

export default function ConditionalLogicEditor( { groups, onChange, otherFields } ) {
	const updateRule = ( groupIndex, ruleIndex, patch ) => {
		onChange(
			groups.map( ( group, gi ) =>
				gi !== groupIndex
					? group
					: {
							rules: group.rules.map( ( rule, ri ) =>
								ri !== ruleIndex ? rule : { ...rule, ...patch }
							),
					  }
			)
		);
	};

	const addRule = ( groupIndex ) => {
		onChange(
			groups.map( ( group, gi ) =>
				gi !== groupIndex
					? group
					: { rules: [ ...group.rules, blankRule() ] }
			)
		);
	};

	const removeRule = ( groupIndex, ruleIndex ) => {
		// Removing a group's only rule removes the whole group -- there's
		// no meaningful "group with zero rules" state to leave behind.
		onChange(
			groups
				.map( ( group, gi ) =>
					gi !== groupIndex
						? group
						: { rules: group.rules.filter( ( _rule, ri ) => ri !== ruleIndex ) }
				)
				.filter( ( group ) => group.rules.length > 0 )
		);
	};

	const addGroup = () => {
		onChange( [ ...groups, { rules: [ blankRule() ] } ] );
	};

	const removeGroup = ( groupIndex ) => {
		onChange( groups.filter( ( _group, gi ) => gi !== groupIndex ) );
	};

	if ( 0 === otherFields.length ) {
		return (
			<p className="description">
				Add another field to this model first -- there&rsquo;s
				nothing else to base a condition on yet.
			</p>
		);
	}

	return (
		<div className="gateway-conditional-logic">
			<p className="gateway-conditional-logic-label">Show this field if</p>
			{ groups.map( ( group, groupIndex ) => (
				<div key={ groupIndex }>
					{ groupIndex > 0 && (
						<p className="gateway-conditional-logic-or">or</p>
					) }
					<div className="gateway-conditional-logic-group">
						{ group.rules.map( ( rule, ruleIndex ) => {
							const operatorMeta =
								OPERATORS.find( ( op ) => op.key === rule.operator ) ||
								OPERATORS[ 2 ];
							const isLastRule = ruleIndex === group.rules.length - 1;

							return (
								<div
									className="gateway-conditional-logic-rule"
									// eslint-disable-next-line react/no-array-index-key -- rules have no other stable identity; reordering isn't supported here, only add/remove, both handled via onChange above.
									key={ ruleIndex }
								>
									<select
										className="regular-text"
										value={ rule.field }
										onChange={ ( event ) =>
											updateRule( groupIndex, ruleIndex, {
												field: event.target.value,
											} )
										}
									>
										{ /* Matches blankRule()'s own `field: ''` -- a genuinely
										 * not-yet-configured rule needs a real option here to
										 * bind to, or the browser would just visually show
										 * whatever the first real field happens to be despite
										 * the underlying value never actually being set to it. */ }
										<option value="">-- Select a field --</option>
										{ otherFields.map( ( field ) => (
											<option key={ field.name } value={ field.name }>
												{ field.label }
											</option>
										) ) }
									</select>
									<select
										className="regular-text"
										value={ rule.operator }
										onChange={ ( event ) =>
											updateRule( groupIndex, ruleIndex, {
												operator: event.target.value,
											} )
										}
									>
										{ OPERATORS.map( ( op ) => (
											<option key={ op.key } value={ op.key }>
												{ op.label }
											</option>
										) ) }
									</select>
									{ operatorMeta.needsValue ? (
										<input
											type="text"
											className="regular-text"
											value={ rule.value }
											onChange={ ( event ) =>
												updateRule( groupIndex, ruleIndex, {
													value: event.target.value,
												} )
											}
										/>
									) : (
										<span className="gateway-conditional-logic-value-placeholder" />
									) }
									{ isLastRule ? (
										<button
											type="button"
											className="gateway-conditional-logic-and"
											onClick={ () => addRule( groupIndex ) }
										>
											and
										</button>
									) : (
										<button
											type="button"
											className="gateway-conditional-logic-remove"
											onClick={ () => removeRule( groupIndex, ruleIndex ) }
											aria-label="Remove rule"
											title="Remove rule"
										>
											×
										</button>
									) }
								</div>
							);
						} ) }
					</div>
					{ groups.length > 1 && (
						<button
							type="button"
							className="gateway-conditional-logic-remove-group"
							onClick={ () => removeGroup( groupIndex ) }
						>
							Remove group
						</button>
					) }
				</div>
			) ) }
			<p>
				<button
					type="button"
					className="button"
					onClick={ addGroup }
				>
					Add rule group
				</button>
			</p>
		</div>
	);
}
