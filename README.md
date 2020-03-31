## Amazon DynamoDB Accelerator (DAX) Lambda Node.js Sample

A sample application showing how to use Amazon DynamoDB Accelerator (DAX) with Lambda and CloudFormation. This is based on the blog post at TODO.

## Setup & Deployment
Deploying the demo will require [npm](https://www.npmjs.com/), the [AWS CLI](https://aws.amazon.com/cli/), and an AWS account. The AWS credentials for that account should be [set up in the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html).

First, download the dependencies using `npm`:

    npm install

Then, create a zip file called geturl.zip containing the `lambda` and `node_modules` folders. On Mac/Linux/WSL, uses the `zip` command:

    zip -qur geturl node_modules lambda

Otherwise, put the necessary folders in a zip file.

CloudFormation needs the code & template to be stored in an S3 bucket (replace <your-bucket-name> with something unique and remember it as you will need it when packaging and deploying):

    aws s3 mb s3://<your-bucket-name>

Now we can create the CloudFormation package and deploy it:

    aws cloudformation package --template-file template.yaml --output-template-file packaged-template.yaml --s3-bucket <your-bucket-name>
    aws cloudformation deploy --template-file packaged-template.yaml --capabilities CAPABILITY_NAMED_IAM --stack-name amazon-dax-lambda-nodejs-sample

One the CloudFormation stack is created, determine the insternal endpoint name (macOS/Linux/WSL):

    gwId=$(aws apigateway get-rest-apis --query "items[?name == 'amazon-dax-lambda-nodejs-sample'].id | [0]" --output text)
    endpointUrl="https://$gwId.execute-api.region.amazonaws.com/Prod"

To shorten a URL:

    curl -d 'https://www.amazon.com' "$endpointUrl"

The output will be a "slug" that can be used to fetch the URL (in this case, grqpaeet):

    curl -v "$endpointUrl/grqpaeet"

## License Summary

This sample code is made available under a modified MIT license. See the LICENSE file.
