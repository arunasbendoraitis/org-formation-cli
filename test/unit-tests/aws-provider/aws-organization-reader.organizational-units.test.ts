import * as path from 'path';
import { Organizations } from 'aws-sdk';
import * as AWSMock from 'aws-sdk-mock';
import { ListOrganizationalUnitsForParentRequest, Organization } from 'aws-sdk/clients/organizations';
import { examples as organizationExamples } from 'aws-sdk/apis/organizations-2016-11-28.examples.json';
import { examples as iamExamples } from 'aws-sdk/apis/iam-2010-05-08.examples.json';
import { examples as stsExamples } from 'aws-sdk/apis/sts-2011-06-15.examples.json';
import { AwsOrganization } from '~aws-provider/aws-organization';
import { AWSAccount, AwsOrganizationReader } from '~aws-provider/aws-organization-reader';

const mockResult = (output: any): jest.Mock => {
    return jest.fn().mockResolvedValue(output);
};

AWSMock.setSDK(path.resolve('node_modules/aws-sdk'));

describe('when reading a organizational unit using reader', () => {
    let organizationService: Organizations;
    let organizationModel: AwsOrganization;
    let reader: AwsOrganizationReader;
    let listOrganizationalUnitsSpy: jest.SpyInstance;
    let listPoliciesSpy: jest.SpyInstance;
    let listRootsSpy: jest.SpyInstance;
    const ous = organizationExamples.ListOrganizationalUnitsForParent[0].output;
    const policies = organizationExamples.ListPolicies[0].output;
    const policy = organizationExamples.DescribePolicy[0].output;
    const roots = organizationExamples.ListRoots[0].output;
    const accounts = organizationExamples.ListAccountsForParent[0].output;
    const organization = organizationExamples.DescribeOrganization[0].output;
    const targets = organizationExamples.ListTargetsForPolicy[0].output;
    const passwordPolicy = iamExamples.GetAccountPasswordPolicy[0].output;
    const aliases = iamExamples.ListAccountAliases[0].output;
    const assumedRole = stsExamples.AssumeRole[0].output;
    const callerIdentity = stsExamples.GetCallerIdentity[0].output;
    const masterAccount = {
        Id: '111111111111',
        ParentId: roots.Roots[0].Id,
        Policies: [],
        Type: 'Account',
        Name: 'Organizational Master Account'
    } as AWSAccount;
    (organization.Organization as Organization).MasterAccountId = masterAccount.Id;
    ous.OrganizationalUnits.shift();

    beforeEach(async () => {
        AWSMock.mock('Organizations', 'listOrganizationalUnitsForParent', mockResult(ous));
        AWSMock.mock('Organizations', 'listPolicies', mockResult(policies));
        AWSMock.mock('Organizations', 'describePolicy', mockResult(policy));
        AWSMock.mock('Organizations', 'listTargetsForPolicy', mockResult(targets));
        AWSMock.mock('Organizations', 'listRoots', mockResult(roots));

        organizationService = new Organizations();
        reader = new AwsOrganizationReader(organizationService);
        organizationModel = new AwsOrganization(reader);

        listOrganizationalUnitsSpy = jest.spyOn(organizationService, 'listOrganizationalUnitsForParent');
        listPoliciesSpy = jest.spyOn(organizationService, 'listPolicies');
        listRootsSpy = jest.spyOn(organizationService, 'listRoots');

        await reader.organizationalUnits.getValue();
    });

    afterEach(() => {
        AWSMock.restore();
    });

    test('organization list organizational units is called', () => {
        expect(listPoliciesSpy).toHaveBeenCalledTimes(1);
        expect(listRootsSpy).toHaveBeenCalledTimes(1);
        expect(listOrganizationalUnitsSpy).toHaveBeenCalledTimes(2);
    });

    test('organization list organizational units was passed the right arguments', () => {
        const args: ListOrganizationalUnitsForParentRequest = listOrganizationalUnitsSpy.mock.calls[0][0];
        expect(args.ParentId).toBe(roots.Roots[0].Id);
    });

    test('master account within a organizational unit', async () => {
        masterAccount.ParentId = ous.OrganizationalUnits[0].Id;
        accounts.Accounts.push(masterAccount as any);
        AWSMock.mock('Organizations', 'listAccountsForParent', mockResult(accounts));
        AWSMock.mock('Organizations', 'listTagsForResource', mockResult({ Tags: [] }));
        AWSMock.mock('Organizations', 'describeOrganization', mockResult(organization));
        const getIdentity = mockResult(callerIdentity);
        AWSMock.mock('STS', 'getCallerIdentity', getIdentity);
        const assumeRole = mockResult(assumedRole);
        AWSMock.mock('STS', 'assumeRole', assumeRole);
        const listAliases = mockResult(aliases);
        AWSMock.mock('IAM', 'listAccountAliases', listAliases);
        const getPasswordPolicy = mockResult(passwordPolicy);
        AWSMock.mock('IAM', 'getAccountPasswordPolicy', getPasswordPolicy);
        const describeSeverity = mockResult({ severityLevels: [{ code: 'high' }] });
        AWSMock.mock('Support', 'describeSeverityLevels', describeSeverity);

        const listAccountsSpy = jest.spyOn(organizationService, 'listAccountsForParent');
        const listTagsSpy = jest.spyOn(organizationService, 'listTagsForResource');
        const describeOrganizationSpy = jest.spyOn(organizationService, 'describeOrganization');

        // TODO: Remove try and catch when implemented
        try {
            await organizationModel.initialize()
        } catch (err) {
            expect(err.message).toContain('Master account outside root organization is not supported yet');
            console.warn('Missing implementation for master account within a organizational unit...');
        }
        expect(listRootsSpy).toHaveBeenCalledTimes(1);
        expect(listOrganizationalUnitsSpy).toHaveBeenCalledTimes(2);
        expect(listAccountsSpy).toHaveBeenCalledTimes(2);
        expect(listTagsSpy).toHaveBeenCalledTimes(6);
        expect(describeOrganizationSpy).toHaveBeenCalledTimes(1);
        expect(getIdentity).toHaveBeenCalledTimes(9);
        expect(assumeRole).toHaveBeenCalledTimes(9);
        expect(listAliases).toHaveBeenCalledTimes(6);
        expect(getPasswordPolicy).toHaveBeenCalledTimes(6);
        expect(describeSeverity).toHaveBeenCalledTimes(6);
    });
});
