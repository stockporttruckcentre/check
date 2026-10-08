Attribute VB_Name = "STCChecks"
' =============================================================
' STC Checks: sends this workbook to the yard app every time it is saved.
'
' Install once per workbook (see excel/README.md):
'   1. Alt+F11, File, Import File, choose this file.
'   2. Double click ThisWorkbook and paste the three lines from
'      ThisWorkbook.txt.
'   3. Save As, Excel Macro-Enabled Workbook (.xlsm), same folder.
'
' What leaves the workbook: only the columns the app asks for (System,
' Stock sheet columns). Cost, NBV, profit and price columns are never
' asked for and never sent.
' =============================================================
Option Explicit

' Which sheet this is: "stock" for the stock sheet, "fleet" for Fleet Serve.
Private Const SOURCE As String = "stock"

Private Const APP_URL As String = "https://gqsecmqlhblyivoourkx.supabase.co/rest/v1/rpc/"
Private Const APP_KEY As String = "PASTE_PUBLISHABLE_KEY"
Private Const SHEET_KEY As String = "PASTE_SHEET_KEY"

Public Sub PushToApp()
    On Error GoTo Failed
    Dim cols As Collection
    Set cols = AskForColumns()
    If cols Is Nothing Then GoTo Failed

    Dim firstHeader As String
    If SOURCE = "stock" Then firstHeader = "stc no" Else firstHeader = "fleet number"

    Dim outRows() As String, n As Long
    ReDim outRows(0 To 1023)
    Dim template As Variant, haveTemplate As Boolean
    Dim ws As Worksheet

    For Each ws In ThisWorkbook.Worksheets
        Dim data As Variant
        data = ws.UsedRange.Value
        If Not IsArray(data) Then GoTo NextSheet
        Dim rOff As Long, cOff As Long
        rOff = ws.UsedRange.Row - 1
        cOff = ws.UsedRange.Column - 1

        Dim hdrRow As Long, r As Long, c As Long
        hdrRow = 0
        For r = 1 To Application.Min(15, UBound(data, 1))
            For c = 1 To UBound(data, 2)
                If LCase$(Trim$(CellText(data(r, c)))) = firstHeader Then hdrRow = r: Exit For
            Next c
            If hdrRow > 0 Then Exit For
        Next r

        Dim headers() As String, startRow As Long
        If hdrRow > 0 Then
            ReDim headers(1 To UBound(data, 2))
            For c = 1 To UBound(data, 2)
                headers(c) = Trim$(CellText(data(hdrRow, c)))
            Next c
            If Not haveTemplate Then template = headers: haveTemplate = True
            startRow = hdrRow + 1
        ElseIf SOURCE = "stock" And haveTemplate And cOff = 0 And LooksLikeStock(data) Then
            ' A tab with no header row, laid out like the others (GH Siemens).
            headers = template
            startRow = 1
        Else
            GoTo NextSheet
        End If

        Dim tabName As String
        tabName = Trim$(ws.Name)
        For r = startRow To UBound(data, 1)
            Dim cells As String, hasValue As Boolean
            cells = "": hasValue = False
            For c = 1 To UBound(data, 2)
                If c <= UBound(headers) Then
                    If headers(c) <> "" Then
                        If IsWanted(cols, tabName, headers(c)) Then
                            Dim v As String
                            v = CellText(data(r, c))
                            If v <> "" Then hasValue = True
                            If cells <> "" Then cells = cells & ","
                            cells = cells & Q(headers(c)) & ":" & Q(v)
                        End If
                    End If
                End If
            Next c
            If hasValue Then
                If n > UBound(outRows) Then ReDim Preserve outRows(0 To UBound(outRows) * 2 + 1)
                outRows(n) = "{""tab"":" & Q(tabName) & ",""cells"":{" & cells & "}}"
                n = n + 1
            End If
        Next r
NextSheet:
    Next ws

    If n = 0 Then GoTo Failed
    ReDim Preserve outRows(0 To n - 1)
    Dim body As String
    body = "{""p_key"":" & Q(SHEET_KEY) & ",""p_source"":" & Q(SOURCE) & ",""p_by"":" & Q(Application.UserName) & ",""p_rows"":[" & Join(outRows, ",") & "]}"

    Dim http As Object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 5000, 5000, 30000, 60000
    http.Open "POST", APP_URL & "sheet_push", False
    http.setRequestHeader "Content-Type", "application/json; charset=utf-8"
    http.setRequestHeader "apikey", APP_KEY
    http.setRequestHeader "Authorization", "Bearer " & APP_KEY
    http.send body
    If http.Status >= 200 And http.Status < 300 Then
        Application.StatusBar = "STC Checks updated " & Format$(Now, "hh:mm") & " (" & n & " rows)"
    Else
        Application.StatusBar = "STC Checks couldn't take this save (" & http.Status & "). It will try again next save."
    End If
    Exit Sub
Failed:
    Application.StatusBar = "STC Checks couldn't be reached. It will try again next save."
End Sub

' The column list the app wants, as "tab|header" in lower case. Tab "*" means any tab.
Private Function AskForColumns() As Collection
    On Error GoTo Nope
    Dim http As Object
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 5000, 5000, 15000, 15000
    http.Open "POST", APP_URL & "sheet_columns_for", False
    http.setRequestHeader "Content-Type", "application/json; charset=utf-8"
    http.setRequestHeader "apikey", APP_KEY
    http.setRequestHeader "Authorization", "Bearer " & APP_KEY
    http.send "{""p_key"":" & Q(SHEET_KEY) & ",""p_source"":" & Q(SOURCE) & "}"
    If http.Status < 200 Or http.Status >= 300 Then GoTo Nope
    Dim s As String, out As New Collection, p As Long, t As String, h As String
    s = http.responseText
    p = 1
    Do
        p = InStr(p, s, """tab"":""")
        If p = 0 Then Exit Do
        t = ReadString(s, p + 7)
        p = InStr(p, s, """header"":""")
        If p = 0 Then Exit Do
        h = ReadString(s, p + 10)
        out.Add LCase$(t) & "|" & LCase$(h)
    Loop
    Set AskForColumns = out
    Exit Function
Nope:
    Set AskForColumns = Nothing
End Function

Private Function ReadString(ByVal s As String, ByVal start As Long) As String
    Dim i As Long, ch As String, out As String
    i = start
    Do While i <= Len(s)
        ch = Mid$(s, i, 1)
        If ch = "\" Then
            out = out & Mid$(s, i + 1, 1): i = i + 2
        ElseIf ch = """" Then
            Exit Do
        Else
            out = out & ch: i = i + 1
        End If
    Loop
    ReadString = out
End Function

' A header is sent when it is the asked-for name, or starts with it and the next
' character is not a letter or a space ("Rental Rate (Weekly)27/06/2025").
Private Function IsWanted(ByVal list As Collection, ByVal tabName As String, ByVal header As String) As Boolean
    Dim item As Variant, parts() As String, hl As String, nextCh As String
    hl = LCase$(header)
    For Each item In list
        parts = Split(item, "|", 2)
        If parts(0) = "*" Or parts(0) = LCase$(tabName) Then
            If hl = parts(1) Then IsWanted = True: Exit Function
            If Left$(hl, Len(parts(1))) = parts(1) And Len(hl) > Len(parts(1)) Then
                nextCh = Mid$(hl, Len(parts(1)) + 1, 1)
                If Not (nextCh Like "[a-z]" Or nextCh = " ") Then IsWanted = True: Exit Function
            End If
        End If
    Next item
End Function

Private Function LooksLikeStock(ByVal data As Variant) As Boolean
    Dim r As Long, t As String, hits As Long
    For r = 1 To Application.Min(20, UBound(data, 1))
        t = CellText(data(r, 1))
        If t Like "#####" Or t Like "######" Or t Like "#######" Then hits = hits + 1
    Next r
    LooksLikeStock = hits >= 2
End Function

Private Function CellText(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Then CellText = "": Exit Function
    Select Case VarType(v)
        Case vbDate
            CellText = Format$(v, "yyyy-mm-dd")
        Case vbDouble, vbSingle, vbCurrency, vbDecimal, vbInteger, vbLong
            If v = Int(v) And Abs(v) < 1E+15 Then CellText = Format$(v, "0") Else CellText = Trim$(Str$(v))
        Case Else
            CellText = Trim$(CStr(v))
    End Select
End Function

Private Function Q(ByVal s As String) As String
    s = Replace(s, "\", "\\")
    s = Replace(s, """", "\""")
    s = Replace(s, vbCrLf, "\n")
    s = Replace(s, vbCr, "\n")
    s = Replace(s, vbLf, "\n")
    s = Replace(s, vbTab, "\t")
    Dim i As Long
    For i = 0 To 31
        s = Replace(s, Chr$(i), " ")
    Next i
    Q = """" & s & """"
End Function
