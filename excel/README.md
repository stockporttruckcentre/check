# Putting the macro in the two spreadsheets

The macro sends the workbook to the app every time anybody saves it, from any PC.
Nothing runs on the server and no PC has to be left on.

Do this once for each file:

- `Z:\STC SALES & LEASING\Sales & Leasing Stock Sheet.xlsx` uses `STCChecks.bas` as it is (`SOURCE = "stock"`).
- `Z:\STC SALES & LEASING\S&L Rentals\fleetserv.xlsx` uses the same file with `SOURCE = "fleet"`.

The two ready filled copies (with the keys in) are handed over in the chat, not kept
in this repository.

## Steps

1. Open the workbook in desktop Excel.
2. Press **Alt+F11**. The code window opens.
3. **File, Import File**, and choose `STCChecks.bas` (the stock one or the fleet one).
4. In the list on the left, double click **ThisWorkbook** and paste in the three lines from
   `ThisWorkbook.txt`.
5. Close the code window.
6. **File, Save As**, same folder, same name, type **Excel Macro-Enabled Workbook (.xlsm)**.
7. Save once more. The bar along the bottom of Excel says
   `STC Checks updated 14:02 (2015 rows)`.

The old `.xlsx` can then be moved out of the way so nobody keeps editing it. Shortcuts
that pointed at it need pointing at the `.xlsm` once.

## What people see

- The first time somebody opens the new file, Excel may show a yellow **Enable content**
  bar. They click it once and Excel remembers.
- Saving takes a second or two longer while it sends.
- If a PC has no internet, the save still works and the bar says it will try again next save.

## What is sent

Only the columns the app asks for, listed in the office under **System, Stock sheet
columns**. NBV, refurb costs, prices and profit are never asked for, so they never
leave the workbook.

## The key

The macro carries a key that only lets it replace the app's copy of the trailer list.
It cannot read checks, people or anything else. If it ever needs changing, a new key is
made in the database and both macros get the new one.
