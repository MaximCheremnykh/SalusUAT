Feature: Salesforce UI Login

  @smokeTest
  Scenario: User logs into Salesforce successfully
    Given I open the Salesforce login page
    When I log in with valid credentials
    Then I should land on the Salesforce Home page
