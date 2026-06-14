// Distribute expense split amounts with remainder adjustment to avoid floating-point drift
export function distributeSplits(amountInInr, participants, splitType, splitDetails, exchangeRate = 1.0) {
  const splits = {};
  if (participants.length === 0) return splits;

  let totalShares = 0;
  let totalPercent = 0;

  if (splitType === 'equal') {
    const shareAmt = Math.round((amountInInr / participants.length) * 100) / 100;
    participants.forEach(p => { splits[p] = shareAmt; });
  } else if (splitType === 'share') {
    participants.forEach(p => {
      totalShares += (splitDetails[p] || 0);
    });
    if (totalShares > 0) {
      participants.forEach(p => {
        const pShare = splitDetails[p] || 0;
        splits[p] = Math.round((amountInInr * (pShare / totalShares)) * 100) / 100;
      });
    } else {
      // Fallback if shares sum to 0
      const shareAmt = Math.round((amountInInr / participants.length) * 100) / 100;
      participants.forEach(p => { splits[p] = shareAmt; });
    }
  } else if (splitType === 'percentage') {
    participants.forEach(p => {
      totalPercent += (splitDetails[p] || 0);
    });
    participants.forEach(p => {
      const pPct = splitDetails[p] || 0;
      const effectivePct = totalPercent > 0 ? (pPct / totalPercent) : (1 / participants.length);
      splits[p] = Math.round((amountInInr * effectivePct) * 100) / 100;
    });
  } else if (splitType === 'unequal') {
    participants.forEach(p => {
      const amtInOriginal = splitDetails[p] || 0;
      splits[p] = Math.round((amtInOriginal * exchangeRate) * 100) / 100;
    });
  }

  // Adjust rounding remainder to the first participant to ensure the split sum matches total amount exactly
  const sumSplits = Object.values(splits).reduce((a, b) => a + b, 0);
  const remainder = Math.round((amountInInr - sumSplits) * 100) / 100;
  if (remainder !== 0 && participants.length > 0) {
    splits[participants[0]] = Math.round((splits[participants[0]] + remainder) * 100) / 100;
  }

  return splits;
}

// Greedy Debt Minimization Algorithm (Aisha's Request)
export function simplifyDebts(userBalances) {
  // userBalances is an object: { Name: balance }
  const debtors = [];
  const creditors = [];

  Object.entries(userBalances).forEach(([name, balance]) => {
    // Round to 2 decimal places to avoid floating point issues
    const rounded = Math.round(balance * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ name, amount: Math.abs(rounded) });
    } else if (rounded > 0.01) {
      creditors.push({ name, amount: rounded });
    }
  });

  const transactions = [];

  // Sort helper descending
  const sortDesc = (a, b) => b.amount - a.amount;

  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(sortDesc);
    creditors.sort(sortDesc);

    const debtor = debtors[0];
    const creditor = creditors[0];

    const amount = Math.min(debtor.amount, creditor.amount);
    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(amount * 100) / 100
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) {
      debtors.shift();
    }
    if (creditor.amount < 0.01) {
      creditors.shift();
    }
  }

  return transactions;
}

// Detailed audit ledger calculation (Rohan's Request)
export function calculateAuditLedger(userId, userName, expenses, splits, settlements) {
  const ledger = [];

  // 1. Process expenses
  expenses.forEach(exp => {
    // Check if user is payer or participant
    const isPayer = exp.paid_by_id === userId;
    const userSplit = splits.find(s => s.expense_id === exp.id && s.user_id === userId);
    
    if (isPayer || userSplit) {
      const shareAmount = userSplit ? userSplit.amount : 0.00;
      let impact = 0.00;
      let description = '';

      if (isPayer) {
        impact = exp.amount_in_inr - shareAmount;
        description = `You paid for "${exp.description}" (Your share: ₹${shareAmount.toFixed(2)})`;
      } else {
        impact = -shareAmount;
        description = `Shared in "${exp.description}" paid by ${exp.paid_by_name}`;
      }

      ledger.push({
        type: 'expense',
        id: exp.id,
        date: exp.date,
        description: exp.description,
        detailText: description,
        payer: exp.paid_by_name,
        totalAmount: exp.amount,
        currency: exp.currency,
        amountInInr: exp.amount_in_inr,
        userShare: shareAmount,
        impact: Math.round(impact * 100) / 100
      });
    }
  });

  // 2. Process settlements
  settlements.forEach(set => {
    const isPayer = set.paid_by === userId;
    const isReceiver = set.paid_to === userId;

    if (isPayer || isReceiver) {
      const impact = isPayer ? set.amount : -set.amount;
      const detailText = isPayer 
        ? `You paid ${set.paid_to_name} (Settlement)` 
        : `${set.paid_by_name} paid you (Settlement)`;

      ledger.push({
        type: 'settlement',
        id: set.id,
        date: set.date,
        description: set.notes || 'Settlement Payment',
        detailText: detailText,
        payer: set.paid_by_name,
        totalAmount: set.amount,
        currency: 'INR',
        amountInInr: set.amount,
        userShare: 0.00,
        impact: Math.round(impact * 100) / 100
      });
    }
  });

  // Sort chronologically
  ledger.sort((a, b) => new Date(a.date) - new Date(b.date));

  return ledger;
}
