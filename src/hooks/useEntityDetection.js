import { useState, useEffect, useRef } from "react";

// Verb patterns for confidence scoring
var ASSIGNEE_VERBS = /\b(with|owned by|assigned to|handled by|from|by)\s+/i;
var RECIPIENT_VERBS = /\b(for|to|send to|get .* to|deliver to|give to)\s+/i;

function scoreMatch(text, name, position) {
  var before = text.slice(0, position).toLowerCase();
  if (ASSIGNEE_VERBS.test(before)) return "assignee";
  if (RECIPIENT_VERBS.test(before)) return "recipient";
  return "ambiguous";
}

export function useEntityDetection(text, contacts, aliases) {
  var [suggestion, setSuggestion] = useState(null);
  var timerRef = useRef(null);

  useEffect(function () {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(function () {
      if (!text || !contacts || contacts.length === 0) {
        setSuggestion(null);
        return;
      }
      var lower = text.toLowerCase();
      var found = null;

      // 1. Alias match (highest priority)
      if (aliases) {
        for (var i = 0; i < aliases.length; i++) {
          var a = aliases[i];
          var idx = lower.indexOf(a.alias.toLowerCase());
          if (idx !== -1) {
            var contact = contacts.find(function (c) { return c.id === a.contact_id; });
            if (contact) {
              found = {
                contact: contact,
                matchedAs: a.alias,
                role: scoreMatch(text, a.alias, idx),
              };
              break;
            }
          }
        }
      }

      // 2. Full name match
      if (!found) {
        for (var j = 0; j < contacts.length; j++) {
          var c = contacts[j];
          if (!c.name) continue;
          var nameIdx = lower.indexOf(c.name.toLowerCase());
          if (nameIdx !== -1) {
            found = {
              contact: c,
              matchedAs: c.name,
              role: scoreMatch(text, c.name, nameIdx),
            };
            break;
          }
        }
      }

      // 3. First name match (only if unambiguous — one contact with that first name)
      if (!found) {
        var firstNameMatches = [];
        for (var k = 0; k < contacts.length; k++) {
          var ct = contacts[k];
          if (!ct.name) continue;
          var firstName = ct.name.split(" ")[0];
          if (firstName.length >= 3 && (
            lower.includes(" " + firstName.toLowerCase() + " ") ||
            lower.includes(" " + firstName.toLowerCase() + "'") ||
            lower.endsWith(" " + firstName.toLowerCase())
          )) {
            firstNameMatches.push(ct);
          }
        }
        if (firstNameMatches.length === 1) {
          var firstName2 = firstNameMatches[0].name.split(" ")[0];
          var fnIdx = lower.indexOf(firstName2.toLowerCase());
          found = {
            contact: firstNameMatches[0],
            matchedAs: firstName2,
            role: scoreMatch(text, firstName2, fnIdx),
          };
        }
      }

      setSuggestion(found);
    }, 300);

    return function () { clearTimeout(timerRef.current); };
  }, [text, contacts, aliases]);

  return suggestion;
}
